/**
 * Every schema shares this. Two things matter:
 *
 * 1. `_id` is projected to `id` and `__v` is dropped, so clients never see
 *    Mongo-specific field names and a future storage change is not a breaking
 *    API change.
 * 2. `password` is deleted unconditionally. It is already `select: false`, but
 *    a stray `.select('+password')` reaching a response would leak a hash, and
 *    this makes that impossible rather than merely unlikely.
 *
 * Deliberately not annotated as `SchemaOptions`: that type is generic over the
 * document type, and a bare annotation pins the generics to `unknown`, which
 * then fails to unify with `SchemaOptions<FlatRecord<IPost>>` and friends.
 * Letting the literal type be inferred keeps it assignable to every schema.
 */
export const baseSchemaOptions = {
  timestamps: true,
  // `false` must stay a literal type here — widened to `boolean` it no longer
  // matches Mongoose's `string | false | undefined`.
  versionKey: false as const,
  toJSON: {
    virtuals: true,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      ret['id'] = String(ret['_id']);
      delete ret['_id'];
      delete ret['password'];
      return ret;
    },
  },
  toObject: { virtuals: true },
};
