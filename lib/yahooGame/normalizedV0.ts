import { z } from "zod"

/** Phase 2 出力の最小検証（緩め：未知キーは許容） */
const sourceEntrySchema = z.object({
  url: z.string().optional(),
  httpStatus: z.number().optional(),
  bytes: z.number().optional(),
  sha256: z.string().optional(),
  error: z.boolean().optional(),
  status: z.string().optional(),
  contentType: z.string().optional(),
})

export const normalizedGameV0Schema = z
  .object({
    schemaVersion: z.literal("yahoo-game-normalized-v0"),
    gameId: z.string().min(8),
    fetchedAt: z.string(),
    sources: z.record(z.string(), sourceEntrySchema),
    meta: z.object({
      documentTitle: z.string().optional(),
      ogTitle: z.string().optional(),
    }),
    scoreboard: z.array(z.unknown()),
    lineupsFromScore: z.array(z.unknown()),
    textPlayByPlay: z.array(z.unknown()),
    statsPlayerLinkedRows: z.array(z.unknown()),
    yahooPlayersMentioned: z.record(z.string(), z.string()).optional(),
    missingOrPartial: z.array(z.string()).optional(),
    pitchByPitch: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

export type NormalizedGameV0 = z.infer<typeof normalizedGameV0Schema>
