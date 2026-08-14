import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface IRefreshToken {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** SHA-256 of the token. The token itself is never stored. */
  tokenHash: string;
  family: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string;
  ip: string;
  createdAt: Date;
}

export type RefreshTokenDocument = HydratedDocument<IRefreshToken>;

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Hashed for the same reason passwords are: a leaked database dump should
    // not hand an attacker a set of working sessions.
    tokenHash: { type: String, required: true },
    // Every token minted from the same login shares a family id. If a revoked
    // token is ever replayed, the whole family is killed — that is the signal
    // that a token was stolen and used after rotation.
    family: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ user: 1 });
refreshTokenSchema.index({ family: 1 });

/**
 * TTL index: mongod removes documents once `expiresAt` passes, so expired
 * sessions are reaped by the database rather than by a cron job we would have
 * to write, deploy, and monitor.
 */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);
