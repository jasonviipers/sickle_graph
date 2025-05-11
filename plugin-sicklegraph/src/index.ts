import { z } from 'zod';
import type { Plugin } from '@elizaos/core';
import { type GenerateTextParams, ModelType, logger } from '@elizaos/core';
import { configSchema } from './environment';
import { elizaResearchAssistantAction } from './actions/elizaResearch-assistant-action';
import { knowledgeGraphQueryAction } from './actions/knowledge-graphquery-action';
import { inferenceEngineAction } from './actions/inference-engine-action';
import { knowledgeGraphProvider } from './provider/knowledge-graph-provider';
import { SickleGraphService } from './service';

const sickleGraphPlugin: Plugin = {
  name: "plugin-sicklegraph",
  description: "SickleGraph: AI-powered knowledge graph for gene therapy innovation in Africa",
  config: {
    KNOWLEDGE_GRAPH_DB_URL: process.env.KNOWLEDGE_GRAPH_DB_URL,
    KNOWLEDGE_GRAPH_DB_TYPE: process.env.KNOWLEDGE_GRAPH_DB_TYPE,
  },
  async init(config) {
    logger.info("*** Initializing SickleGraph Plugin ***");
    try {
      const validatedConfig = await configSchema.parseAsync(config);
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid SickleGraph plugin configuration: ${error.errors.map((e) => e.message).join(", ")}`
        );
      }
      throw error;
    }
  },
  models: {
    [ModelType.TEXT_SMALL]: async (_runtime, { prompt, stopSequences = [] }) => {
      // In a real implementation, this would use a specialized biomedical language model
      return "SickleGraph biomedical language model response";
    },
    [ModelType.TEXT_LARGE]: async (_runtime, {
      prompt,
      stopSequences = [],
      maxTokens = 8192,
      temperature = 0.7,
      frequencyPenalty = 0.7,
      presencePenalty = 0.7
    }: GenerateTextParams) => {
      // In a real implementation, this would use a specialized biomedical language model
      return "SickleGraph advanced biomedical language model response with detailed analysis";
    }
  },
  tests: [
    {
      name: "sicklegraph_test_suite",
      tests: [
        {
          name: "knowledge_graph_test",
          fn: async (runtime) => {
            logger.debug("knowledge_graph_test run by ", runtime.character.name);
            // In a real implementation, this would test the knowledge graph functionality
          }
        },
        {
          name: "should_have_knowledge_graph_query_action",
          fn: async (runtime) => {
            const actionExists = sickleGraphPlugin.actions.some((a) => a.name === "KNOWLEDGE_GRAPH_QUERY");
            if (!actionExists) {
              throw new Error("Knowledge graph query action not found in plugin");
            }
          }
        }
      ]
    }
  ],
  routes: [
    {
      path: "/genes",
      type: "GET",
      handler: async (_req, res) => {
        // In a real implementation, this would query the knowledge graph for genes
        res.json({
          genes: [
            { id: "HBB", name: "Hemoglobin Subunit Beta", description: "Encodes the beta subunit of hemoglobin" },
            { id: "BCL11A", name: "BAF Chromatin Remodeling Complex Subunit", description: "Regulates fetal hemoglobin expression" }
          ]
        });
      }
    },
    {
      path: "/genes/:gene_id",
      type: "GET",
      handler: async (req, res) => {
        const geneId = req.params.gene_id;
        // In a real implementation, this would query the knowledge graph for a specific gene
        res.json({
          id: geneId,
          name: geneId === "HBB" ? "Hemoglobin Subunit Beta" : "Unknown Gene",
          description: geneId === "HBB" ? "Encodes the beta subunit of hemoglobin" : "No description available"
        });
      }
    },
    {
      path: "/eliza/query",
      type: "POST",
      handler: async (req, res) => {
        const query = req.body.query;
        // In a real implementation, this would query the ELIZA AI Research Assistant
        res.json({
          response: `ELIZA AI Research Assistant response to: "${query}"`
        });
      }
    }
  ],
  events: {
    MESSAGE_RECEIVED: [
      async (params) => {
        logger.debug('MESSAGE_RECEIVED in SickleGraph:', Object.keys(params));
        // In a real implementation, this could analyze messages for biomedical research queries
      }
    ]
  },
  services: [SickleGraphService],
  actions: [
    knowledgeGraphQueryAction,
    elizaResearchAssistantAction,
    inferenceEngineAction],
  providers: [knowledgeGraphProvider]
};

export default sickleGraphPlugin;