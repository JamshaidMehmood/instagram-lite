import bcrypt from 'bcrypt';
import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

import { env } from '../config/env';
import { baseSchemaOptions } from './serialization';

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  username: string;
  email: string;
  // Optional because an account created through Google never has one. Every
  // read of it has to cope with its absence, which is why `comparePassword`
  // answers `false` instead of reaching for bcrypt.
  password?: string;
  googleId?: string;
  bio: string;
  avatarColor: string;
  avatarUrl: string;
  avatarMediaId?: Types.ObjectId;
  followerCount: number;
  followingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name must be at most 60 characters'],
    },
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: [/^[a-z0-9._]+$/, 'Username may only contain letters, numbers, dots and underscores'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    // Not `required`: a Google account proves identity with an ID token and
    // has no password to store. Password login is then unavailable to it,
    // which `comparePassword` enforces.
    password: {
      type: String,
      // Excluded from every query by default. Reading it requires an explicit
      // `.select('+password')`, which only the login path does.
      select: false,
    },
    googleId: { type: String },
    bio: {
      type: String,
      trim: true,
      maxlength: [160, 'Bio must be at most 160 characters'],
      default: '',
    },
    // Chosen once at signup so a user's avatar colour is identical on every
    // device and in every client, instead of each frontend hashing its own.
    avatarColor: { type: String, default: '#6366F1' },
    // Google's profile photo, or one of ours at `/api/v1/media/:id`, when there
    // is one. Empty string rather than undefined so clients have a single falsy
    // check: '' means fall back to the initial-on-`avatarColor` avatar.
    avatarUrl: { type: String, default: '' },

    // Set only when the user uploaded their own avatar, and the sole thing that
    // distinguishes the two kinds of `avatarUrl`. The URL alone cannot be
    // trusted to say who owns the bytes, and replacing or removing an avatar
    // has to know: ours means GridFS bytes to reclaim, Google's means a
    // third-party URL to simply forget. Deleting on a Google URL would at best
    // be a no-op against a file we never wrote and at worst delete somebody
    // else's — we do not own it, so it is left alone.
    avatarMediaId: { type: Schema.Types.ObjectId },

    // Denormalised counters. Profile headers and every suggestion row render
    // these, so deriving them would mean a count query per user per rendered
    // list. They are maintained with atomic `$inc` alongside the follow write
    // that changes them, so they cannot drift under concurrency.
    followerCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
  },
  baseSchemaOptions,
);

/**
 * Uniqueness is enforced by the database, not by a read-then-write check in
 * the service layer. Two concurrent signups with the same email would both
 * pass a `findOne` check and both insert; a unique index cannot be raced.
 */
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

/**
 * `sparse` is what makes this survivable. Only Google accounts carry a
 * `googleId`; every password account leaves it unset, and a non-sparse unique
 * index treats those as a shared `null` key — the second password signup would
 * be rejected as a duplicate. Sparse omits missing values from the index
 * entirely, so uniqueness applies only to accounts that actually have one.
 */
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

/**
 * Hashing lives in the model so no call site can forget it — `User.create`,
 * `save`, and password changes all funnel through here.
 *
 * The `!this.password` bail is for Google accounts: the field is absent, and
 * `bcrypt.hash(undefined, …)` throws rather than returning something harmless.
 */
userSchema.pre('save', async function hashPassword(this: UserDocument, next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, env.BCRYPT_ROUNDS);
  next();
});

userSchema.method(
  'comparePassword',
  async function comparePassword(this: UserDocument, candidate: string) {
    // A Google-only account has no hash, and `bcrypt.compare` throws on an
    // undefined one. Answering `false` turns "this account cannot log in with
    // a password" into an ordinary failed login instead of a 500.
    if (!this.password) return false;
    return bcrypt.compare(candidate, this.password);
  },
);

export const User = model<IUser, UserModel>('User', userSchema);
