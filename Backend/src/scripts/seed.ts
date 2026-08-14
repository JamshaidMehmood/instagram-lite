import fs from 'node:fs';

import mongoose, { type Types } from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Comment } from '../models/Comment';
import { Follow } from '../models/Follow';
import { Like } from '../models/Like';
import { Notification, type NotificationType } from '../models/Notification';
import { Post } from '../models/Post';
import { RefreshToken } from '../models/RefreshToken';
import { SavedPost } from '../models/SavedPost';
import { User } from '../models/User';
import { getBucket, mediaUrl, storeImage } from '../modules/media/media.service';
import { readImageInfo } from '../utils/imageDimensions';
import { ensureSeedPhotos, type PhotoSpec } from './fetchPhotos';

/**
 * Populates a development database with users, follows, posts, likes and
 * comments so the UI can be exercised without clicking through signup and
 * upload first.
 *
 * Post images are real photographs downloaded with Playwright (see
 * `fetchPhotos.ts`), so the seeded feed looks like an actual feed rather than
 * a wall of placeholder gradients.
 */

const MEMBER_PASSWORD = 'Password1';

/**
 * The demo account. Seeded first so it authors content and shows an engaged
 * state (it likes and comments on others, and others like and comment on it),
 * and surfaced in the sign-in page via the same credentials in the frontend's
 * `config.ts`. Keep the two in sync.
 */
const DEMO = {
  name: 'Demo User',
  email: 'demo@example.com',
  password: 'Demo1234',
  bio: '👋 The demo account — post a photo, like something, leave a comment. Have a look around.',
  color: '#7C3AED',
} as const;

const PEOPLE = [
  { name: 'Ayesha Khan', email: 'ayesha@example.com', bio: 'Architect. Chasing light.', color: '#EC4899' },
  { name: 'Bilal Ahmed', email: 'bilal@example.com', bio: 'Coffee, code, and long walks.', color: '#6366F1' },
  { name: 'Hina Raza', email: 'hina@example.com', bio: 'Illustrator · Karachi', color: '#F59E0B' },
  { name: 'Usman Tariq', email: 'usman@example.com', bio: 'Mountains > everything.', color: '#10B981' },
  { name: 'Sara Malik', email: 'sara@example.com', bio: 'Photographer. Available for shoots.', color: '#0EA5E9' },
  { name: 'Zain Abbas', email: 'zain@example.com', bio: 'Always somewhere new. 🌍', color: '#F43F5E' },
  { name: 'Mariam Farooq', email: 'mariam@example.com', bio: 'Product designer · type nerd', color: '#14B8A6' },
] as const;

/**
 * Every account in seed order. The demo is index 0 so it authors the first
 * post in the feed. All members share one password; the demo has its own.
 */
const ACCOUNTS = [
  { ...DEMO },
  ...PEOPLE.map((person) => ({ ...person, password: MEMBER_PASSWORD })),
] as const;

/**
 * Captions are written to read naturally over any well-shot photo — the seed
 * pulls whatever the catalog serves, so nothing here promises a specific
 * subject. `size` is the aspect the photo is cropped to at download time.
 */
const POSTS = [
  { caption: 'Golden hour never misses.', location: 'Lahore', size: [1080, 1350] },
  { caption: 'Six months of work, finally something to show for it.', location: 'Karachi', size: [1080, 1080] },
  { caption: 'Got up before sunrise for this. No regrets.', location: 'Naran', size: [1350, 1080] },
  { caption: 'New corner of the studio. Plants pending.', location: '', size: [1080, 1080] },
  { caption: 'Kept the palette simple this week.', location: 'Islamabad', size: [1080, 1350] },
  { caption: 'The long way home, every time.', location: 'Hunza', size: [1350, 1080] },
  { caption: 'Travelling light for once.', location: '', size: [1080, 1080] },
  { caption: 'Third attempt at this frame. Third time lucky.', location: 'Skardu', size: [1080, 1350] },
  { caption: 'Rooftop coffee before the city wakes up.', location: 'Lahore', size: [1080, 1080] },
  { caption: 'Testing a new lens. Obsessed already.', location: '', size: [1350, 1080] },
  { caption: 'Quiet streets, loud colours.', location: 'Rawalpindi', size: [1080, 1350] },
  { caption: 'Notebook, pen, and a plan.', location: '', size: [1080, 1080] },
  { caption: 'The light through these windows every evening.', location: 'Multan', size: [1080, 1350] },
  { caption: 'Weekend reset. Nowhere to be.', location: 'Murree', size: [1350, 1080] },
  { caption: 'Small details, big difference.', location: '', size: [1080, 1080] },
  { caption: 'One more before the sun disappears.', location: 'Gwadar', size: [1080, 1350] },
] as const;

const COMMENTS = [
  'This is unreal 🔥',
  'The colours here are so good.',
  'Okay this is my new wallpaper.',
  'How do you keep finding these spots?',
  'Composition is perfect.',
  'Saving this one.',
  'Left me speechless 😍',
  'Teach me your ways!',
  'The light in this is everything.',
  'Instant like.',
  'Wow, where is this?',
  'Absolute favourite of yours so far.',
] as const;

/**
 * How many comments each post gets, by feed position. A hand-picked pattern
 * rather than a formula so the demo has an obviously uneven, lifelike spread
 * (a couple of quiet posts, a couple of busy threads) instead of the same
 * count on every card. Length matches POSTS.
 */
const COMMENT_COUNTS = [3, 1, 4, 2, 0, 3, 2, 5, 1, 4, 2, 0, 3, 1, 4, 2] as const;

/**
 * The follow graph, expressed as offsets from each account's own position in
 * ACCOUNTS and wrapped through it — offset 6 for account 5 means "follows
 * account 3". Hand-picked like COMMENT_COUNTS rather than generated: a ring
 * where everyone follows the next N accounts gives every profile an identical
 * follower and following count, which reads as fake the moment you open two of
 * them. Row order matches ACCOUNTS, so row 0 is the demo.
 *
 * The demo follows six of the seven others, so its Following feed is full on
 * first sign-in rather than showing only its own two posts, and five of them
 * follow it back so its profile shows a real audience. The gaps are
 * deliberate: the one account it neither follows nor is followed by is what
 * the suggestions panel has left to offer, and the one it follows without a
 * follow back keeps the two counts from mirroring each other.
 */
const FOLLOW_OFFSETS = [
  [1, 2, 3, 4, 5, 6],
  [1, 3, 7],
  [1, 2, 6],
  [1, 4, 5],
  [2, 5],
  [1, 2, 3, 6],
  [1, 2, 5],
  [2, 3, 6],
] as const;

/**
 * Which seed photo the demo account wears. A square one (POSTS[3] is 1080×1080)
 * because an avatar is rendered as a circle, and a 4:5 portrait loses most of
 * its subject to that crop.
 */
const AVATAR_PHOTO_INDEX = 3;

/**
 * Saved posts, as [account index, post index] pairs. Hand-picked like
 * COMMENT_COUNTS: two accounts save a pair, two save one, and the demo is among
 * them so its Saved tab has something in it the first time it is opened rather
 * than an empty state. Post `n` is authored by account `n % ACCOUNTS.length`,
 * which is what makes every pair below someone else's post.
 */
const SAVED_POSTS = [
  [0, 3],
  [0, 6],
  [1, 0],
  [1, 12],
  [2, 8],
  [4, 0],
  [4, 2],
  [6, 5],
] as const;

/**
 * How many of each account's newest notifications are left unread. The badge is
 * as much a part of the seeded state as the rows are: leaving everything unread
 * makes the whole feed glow and never shows what a read row looks like, while
 * marking everything read hides the badge entirely.
 */
const UNREAD_PER_RECIPIENT = 4;

/**
 * Notifications are spaced along one ladder, newest first. They need times of
 * their own because the rows they are derived from carry either a post's
 * backdated timestamp or the seed's own run time, and neither is when the like
 * or the follow "happened". 37 minutes is tuned against the 9-hour gap between
 * posts: a post draws roughly seven notifications, so its engagement stays
 * inside the window before the next post went up rather than overrunning it.
 *
 * The newest post is the one place the ladder cannot be honest. It is created at
 * the seed's run time, so there is no room after it for its engagement to land
 * in, and those few rows sit above it instead.
 */
const NOTIFICATION_STEP_MS = 37 * 60 * 1000;

/** Read an hour after it arrived — never before, which no UI could explain. */
const READ_DELAY_MS = 60 * 60 * 1000;

/** An event-shaped notification, before it is given a place on the ladder. */
interface DerivedNotification {
  recipient: Types.ObjectId;
  actor: Types.ObjectId;
  type: NotificationType;
  post?: Types.ObjectId;
  comment?: Types.ObjectId;
}

function pick<T>(items: readonly T[], index: number): T {
  const value = items[index % items.length];
  if (value === undefined) throw new Error('Empty collection passed to pick()');
  return value;
}

async function seed(): Promise<void> {
  // Seeding truncates collections. That is fine for a scratch database and
  // catastrophic anywhere real, so refuse outright in production.
  if (env.isProduction) {
    throw new Error('Refusing to seed a production database');
  }

  // Fetch the photos first: if the network or the browser is unavailable, fail
  // before touching the database rather than half-seeding it.
  const specs: PhotoSpec[] = POSTS.map((post) => ({ width: post.size[0], height: post.size[1] }));
  const photos = await ensureSeedPhotos(specs);

  // Read and decode every image *before* the destructive wipe below. If any
  // asset is unreadable or corrupt, this throws while the database is still
  // intact — closing the window where a decode failure mid-loop could leave the
  // database wiped and only partially repopulated.
  const images = photos.map((photo, index) => {
    const bytes = fs.readFileSync(photo.path);
    const info = readImageInfo(bytes);
    if (!info) throw new Error(`Seed photo ${index} (${photo.path}) is not a decodable image`);
    return { bytes, info };
  });

  await connectToDatabase();
  logger.info(`Seeding ${env.MONGODB_DB_NAME}`);

  await Promise.all([
    User.deleteMany({}),
    Post.deleteMany({}),
    Comment.deleteMany({}),
    Like.deleteMany({}),
    Follow.deleteMany({}),
    Notification.deleteMany({}),
    SavedPost.deleteMany({}),
    RefreshToken.deleteMany({}),
  ]);

  // GridFS files live in their own collections, so clearing Post is not enough
  // to reclaim the image bytes.
  await getBucket()
    .drop()
    .catch(() => undefined); // absent on a fresh database

  const users = await Promise.all(
    ACCOUNTS.map((account) =>
      User.create({
        name: account.name,
        email: account.email,
        password: account.password, // hashed by the model's pre-save hook
        username: account.email.split('@')[0],
        bio: account.bio,
        avatarColor: account.color,
      }),
    ),
  );

  const demo = pick(users, 0); // ACCOUNTS[0] is the demo account

  // The avatar bytes go through `storeImage`, the same helper `PUT
  // /users/me/avatar` uses, rather than being written straight into the field.
  // That helper is what sniffs the real content type and dimensions and lands
  // the bytes in GridFS; a hand-written `avatarUrl` would point `/api/v1/media`
  // at an id that was never stored. Setting `avatarMediaId` alongside it is what
  // marks the photo as ours — a Google avatar leaves it unset, and that is how a
  // later replace or removal knows whether there are bytes to reclaim.
  const avatarImage = images[AVATAR_PHOTO_INDEX];
  if (!avatarImage) throw new Error(`Missing decoded photo ${AVATAR_PHOTO_INDEX} for the demo avatar`);
  const storedAvatar = await storeImage(avatarImage.bytes, 'seed-avatar-demo.jpg', String(demo._id));
  await User.updateOne(
    { _id: demo._id },
    { $set: { avatarMediaId: storedAvatar.id, avatarUrl: mediaUrl(storedAvatar.id) } },
  );

  const follows = [];
  for (const [index, follower] of users.entries()) {
    for (const offset of pick(FOLLOW_OFFSETS, index)) {
      const target = pick(users, index + offset);
      // FOLLOW_OFFSETS never uses offset 0, but the wrap makes a self-edge one
      // typo away and the unique index would reject the whole insertMany batch.
      if (target._id.equals(follower._id)) continue;
      follows.push({ follower: follower._id, following: target._id });
    }
  }
  await Follow.insertMany(follows);

  // followerCount and followingCount are denormalised — the live write path
  // moves them with atomic $inc alongside each edge, so the seed has to leave
  // them agreeing with the rows it just inserted. One bulkWrite instead of a
  // pair of updates per user keeps it to a single round trip.
  const followerCounts = new Map<string, number>();
  const followingCounts = new Map<string, number>();
  for (const edge of follows) {
    const followerId = edge.follower.toString();
    const followingId = edge.following.toString();
    followingCounts.set(followerId, (followingCounts.get(followerId) ?? 0) + 1);
    followerCounts.set(followingId, (followerCounts.get(followingId) ?? 0) + 1);
  }
  await User.bulkWrite(
    users.map((user) => ({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            followerCount: followerCounts.get(user._id.toString()) ?? 0,
            followingCount: followingCounts.get(user._id.toString()) ?? 0,
          },
        },
      },
    })),
  );

  const posts = [];
  for (const [index, spec] of POSTS.entries()) {
    const author = pick(users, index);
    const image = images[index];
    if (!image) throw new Error(`Missing decoded photo for post ${index}`);

    // The real photo bytes (already validated above) go through the same upload
    // path a user would hit, so dimensions are sniffed exactly as in production.
    const stored = await storeImage(image.bytes, `seed-${index}.jpg`, String(author._id));

    posts.push(
      await Post.create({
        author: author._id,
        caption: spec.caption,
        location: spec.location,
        image: {
          mediaId: stored.id,
          width: stored.info.width,
          height: stored.info.height,
          contentType: stored.info.contentType,
        },
        // Spread over the past week so the feed has a believable ordering.
        createdAt: new Date(Date.now() - index * 9 * 60 * 60 * 1000),
      }),
    );
  }

  let likeTotal = 0;
  let commentTotal = 0;

  // Notifications are *derived* from the engagement below rather than invented
  // beside it, so the activity feed always agrees with the content it describes.
  // A parallel set of rows would drift the moment either side changed — a like
  // retuned here would leave a notification pointing at nothing.
  const derivedNotifications: DerivedNotification[] = [];

  for (const [postIndex, post] of posts.entries()) {
    const author = pick(users, postIndex);

    // Deterministic but uneven engagement, so counters visibly differ. The
    // author is excluded from its own likers — you cannot like your own post.
    const likers = users.filter(
      (user, userIndex) => !user._id.equals(author._id) && (userIndex + postIndex * 2) % 3 !== 0,
    );
    await Like.insertMany(likers.map((user) => ({ post: post._id, user: user._id })));

    // A varied, position-based count; commenters are distinct users rotated by
    // post so the same people are not always first to comment.
    const commentCount = Math.min(pick(COMMENT_COUNTS, postIndex), users.length);
    const commenters = Array.from(
      { length: commentCount },
      (_, offset) => pick(users, postIndex + offset + 1),
    );
    const comments = await Comment.insertMany(
      commenters.map((user, index) => ({
        post: post._id,
        author: user._id,
        text: pick(COMMENTS, postIndex + index),
      })),
    );

    // A post's comments are laid on the ladder before its likes purely so the
    // newest rows in the feed are a mix of types instead of a run of identical
    // ones — the first thing anyone sees is the top of this list.
    for (const comment of comments) {
      // The commenter rotation happens never to land on the author, but "never
      // notify yourself" is the rule the notification service enforces
      // regardless of the arithmetic feeding it, so the seed obeys it too.
      if (comment.author.equals(author._id)) continue;
      derivedNotifications.push({
        recipient: author._id,
        actor: comment.author,
        type: 'comment',
        post: post._id,
        comment: comment._id,
      });
    }

    // `likers` already excludes the author, so there is no self-notification
    // left to filter out here.
    for (const liker of likers) {
      derivedNotifications.push({
        recipient: author._id,
        actor: liker._id,
        type: 'like',
        post: post._id,
      });
    }

    // Counters are denormalised, so the seed must set them to match reality
    // exactly as the write paths would.
    await Post.updateOne(
      { _id: post._id },
      { $set: { likeCount: likers.length, commentCount: commenters.length } },
    );

    likeTotal += likers.length;
    commentTotal += commenters.length;
  }

  // Follows go on the bottom of the ladder because the graph is the oldest thing
  // in the seed: every like and comment above it was left on a post by someone
  // who was already following.
  for (const edge of follows) {
    derivedNotifications.push({ recipient: edge.following, actor: edge.follower, type: 'follow' });
  }

  // One `Date.now()` for the whole ladder — reading the clock per row would make
  // the spacing depend on how long the insert loop above took.
  const notifiedFrom = Date.now();
  const seenPerRecipient = new Map<string, number>();
  const notifications = derivedNotifications.map((row, rank) => {
    const createdAt = new Date(notifiedFrom - rank * NOTIFICATION_STEP_MS);

    // The list is newest-first, so the first rows a recipient appears in are
    // that recipient's most recent — exactly the ones to leave unread.
    const key = row.recipient.toString();
    const rankForRecipient = seenPerRecipient.get(key) ?? 0;
    seenPerRecipient.set(key, rankForRecipient + 1);

    return {
      ...row,
      createdAt,
      readAt:
        rankForRecipient < UNREAD_PER_RECIPIENT
          ? null
          : new Date(createdAt.getTime() + READ_DELAY_MS),
    };
  });
  await Notification.insertMany(notifications);

  const saved = [];
  for (const [accountIndex, postIndex] of SAVED_POSTS) {
    const user = pick(users, accountIndex);
    const post = pick(posts, postIndex);
    // Nothing in the database stops an account saving its own post — the unique
    // index only guards against saving one twice — so a mistyped pair above is
    // dropped here instead of turning up in someone's Saved tab.
    if (post.author.equals(user._id)) continue;
    saved.push({ user: user._id, post: post._id });
  }
  await SavedPost.insertMany(saved);

  const unreadTotal = notifications.filter((row) => row.readAt === null).length;

  logger.info(
    {
      users: users.length,
      follows: follows.length,
      posts: posts.length,
      likes: likeTotal,
      comments: commentTotal,
      notifications: notifications.length,
      unread: unreadTotal,
      saved: saved.length,
    },
    'Seed complete',
  );
  logger.info(
    `Photos by: ${[...new Set(photos.map((photo) => photo.author))].join(', ')} (via Unsplash / Lorem Picsum)`,
  );

  // Printed as a clear block so anyone running the seed knows exactly how to
  // get into the demo. These credentials are mirrored in the frontend's
  // "Try the demo" button.
  logger.info(
    `\n  ┌─────────────────────────────────────────────┐\n` +
      `  │  DEMO ACCOUNT                               │\n` +
      `  │  email:    ${DEMO.email.padEnd(33)}│\n` +
      `  │  password: ${DEMO.password.padEnd(33)}│\n` +
      `  └─────────────────────────────────────────────┘`,
  );
  logger.info(
    `Other accounts: ${PEOPLE.map((p) => p.email).join(', ')} — password "${MEMBER_PASSWORD}"`,
  );
}

seed()
  .then(() => disconnectFromDatabase())
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    logger.fatal({ err: error }, 'Seed failed');
    void mongoose.connection.close().finally(() => process.exit(1));
  });
