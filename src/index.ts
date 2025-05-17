import {
  type Plugin,
  type IAgentRuntime,
  type Project,
  type ProjectAgent,
  logger,
} from '@elizaos/core';
import { ResearchAssistantAction } from "./actions/research-assistant";
import { SickleGraphService } from "./services/sickle-graph-service";
import { SickleGraphRoutes } from "./routes";
import { character, initCharacter } from "./character/sicklegraph-agent";
import { NCBIService } from './services/ncbi-service';
import { KnowledgeManager } from './services/knowledge-manager';


/**
 * SickleGraph plugin for ElizaOS
 */
export const SickleGraphPlugin: Plugin = {
  name: 'SickleGraph',
  description: 'Biomedical knowledge graph for gene therapy research',
  actions: [ResearchAssistantAction],
  services: [SickleGraphService, NCBIService],
  routes: SickleGraphRoutes,
  config: {
    NCBI_API_KEY: process.env.NCBI_API_KEY,
    NCBI_BASE_URL: process.env.NCBI_BASE_URL,
    KUZU_DB_PATH: process.env.KUZU_DB_PATH,
  },

  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    logger.info("Initializing SickleGraph plugin");
    logger.info(config);
    const sicklegraphService = await runtime.getService<SickleGraphService>(
      SickleGraphService.serviceType
    );

    const ncbiService = runtime.getService<NCBIService>(
      NCBIService.serviceType
    );
    // Initialize knowledge manager
    const knowledgeManager = new KnowledgeManager(
      runtime,
      sicklegraphService,
      ncbiService
    );
    // Load base knowledge (fire-and-forget with error logging)
    knowledgeManager.initializeBaseKnowledge()
    logger.info('SickleGraph plugin ready');
  },
}

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [SickleGraphPlugin],
};
const project: Project = {
  agents: [projectAgent],
};

export default project;