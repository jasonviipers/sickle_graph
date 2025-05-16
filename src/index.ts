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


/**
 * SickleGraph plugin for ElizaOS
 */
export const SickleGraphPlugin: Plugin = {
  name: 'SickleGraph',
  description: 'Biomedical knowledge graph for gene therapy research',

  actions: [ResearchAssistantAction],
  services: [SickleGraphService, NCBIService],
  routes: SickleGraphRoutes,

  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    // Initialize services
    await runtime.getService<SickleGraphService>(
      SickleGraphService.serviceType
    );
    // const sicklegraphService = await runtime.getService<SickleGraphService>(
    //   SickleGraphService.serviceType
    // );
    const ncbiService = await runtime.getService<NCBIService>(
      NCBIService.serviceType
    );
    await ncbiService.initialize();

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