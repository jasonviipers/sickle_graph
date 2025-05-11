import { type IAgentRuntime, Service, logger } from '@elizaos/core';


export class SickleGraphService extends Service {
    constructor(protected runtime: IAgentRuntime) {
        super(runtime);
        this.runtime = runtime;
    }

    static serviceType = "sicklegraph";
    capabilityDescription = "This service provides access to the SickleGraph knowledge graph for gene therapy innovation in Africa.";

    static async start(runtime: IAgentRuntime) {
        logger.info(`*** Starting SickleGraph service: ${(new Date()).toISOString()} ***`);
        const service = new SickleGraphService(runtime);
        return service;
    }

    static async stop(runtime: IAgentRuntime) {
        logger.info("*** Stopping SickleGraph service ***");
        const service = runtime.getService(SickleGraphService.serviceType);
        if (!service) {
            throw new Error("SickleGraph service not found");
        }
        service.stop();
    }

    async stop() {
        logger.info("*** SickleGraph service stopped ***");
    }
}