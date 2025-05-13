import { IAgentRuntime, logger, Plugin } from "@elizaos/core";
import { Routes } from "./routes";

export const SickleGraphPlugin: Plugin = {
    name: 'SickleGraphPlugin',
    description: 'SickleGraphPlugin',
    actions: [],
    routes: Routes,
    providers: [],
    evaluators: [],
    init: async (config: Record<string, string>, runtime: IAgentRuntime) => {
        logger.info('SickleGraphPlugin init');
        logger.info(config);
        // setTimeout(async () => {
        //     await runtime.evaluate('hello world');
        // }, 10000); //prevent undefined error, the db property is not available immediately
    },
}