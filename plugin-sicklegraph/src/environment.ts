import { IAgentRuntime } from '@elizaos/core';
import { z } from 'zod';

/**
 * Defines the configuration schema for a plugin, including the validation rules for the plugin name.
 *
 * @type {import('zod').ZodObject<{ SICKLEGRAPH_PLUGIN_VARIABLE: import('zod').ZodString }>}
 */
export const configSchema = z.object({
  KNOWLEDGE_GRAPH_DB_URL: z.string().min(1, "Knowledge Graph Database URL is required").optional(),
  KNOWLEDGE_GRAPH_DB_TYPE: z.enum(["kuzu", "neo4j"]).optional().default("kuzu"),
});

export const config = configSchema.parse(process.env);

export type configEnvSchema = z.infer<typeof configSchema>;

export async function ValidateconfigSchema(runtime: IAgentRuntime): Promise<configEnvSchema> {
  try {
    const config = {
      KNOWLEDGE_GRAPH_DB_URL: runtime.getSetting("KNOWLEDGE_GRAPH_DB_URL"),
      KNOWLEDGE_GRAPH_DB_TYPE: runtime.getSetting("KNOWLEDGE_GRAPH_DB_TYPE"),
      API_KEY: runtime.getSetting("API_KEY"),
    }
    return configSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMsg = error.errors.map((e) => e.message).join(", ");
      throw new Error(`Not all environment variables are set: ${errorMsg}`);
    }
    throw error;
  }
}