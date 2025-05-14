import { IAgentRuntime, logger, Plugin } from "@elizaos/core";
import { SickleGraphRoutes } from "./routes";
import { SickleGraphService } from "./services";
import { ResearchAssistantAction } from "./actions/research-assistant";

/**
 * SickleGraph plugin for ElizaOS
 */
export const SickleGraphPlugin: Plugin = {
    name: 'SickleGraph',
    description: 'Biomedical knowledge graph for gene therapy research',
    
    actions: [ResearchAssistantAction],
    routes: SickleGraphRoutes,

    services: [],
    providers: [],
    evaluators: [],

    init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
        logger.info('Initializing SickleGraph plugin');
        // Warm up the service
        const service = await runtime.getService<SickleGraphService>(
            SickleGraphService.serviceType
        );
        logger.info('SickleGraph plugin ready');
    },
}