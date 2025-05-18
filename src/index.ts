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


/**
 * SickleGraph plugin for ElizaOS
 */
export const SickleGraphPlugin: Plugin = {
  name: 'SickleGraph',
  description: 'Biomedical knowledge graph for gene therapy research',

  actions: [ResearchAssistantAction],
  services: [SickleGraphService],
  routes: SickleGraphRoutes,

  init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
    logger.info('Initializing SickleGraph plugin');
    // Warm up the service
    //  await runtime.getService<SickleGraphService>(
    //   SickleGraphService.serviceType
    // );
    
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