import { IAgentRuntime, logger, Service } from "@elizaos/core";
import { KuzuAdapter } from "../db/kuzu-adapter";

export class SickleGraphService extends Service {
    private dbAdapter: KuzuAdapter | null = null;

    constructor(protected runtime: IAgentRuntime) {
        super(runtime);
        this.runtime = runtime;
    }

    static serviceType = "sicklegraph";
    capabilityDescription = "This service provides access to the SickleGraph knowledge graph for gene therapy innovation in Africa.";

    static async stop(runtime: IAgentRuntime) {
        logger.info("*** Stopping SickleGraph service ***");
        const service = runtime.getService(SickleGraphService.serviceType);
        if (!service) {
            throw new Error("SickleGraph service not found");
        }
        service.stop();
    }

    async stop() {
        if(this.dbAdapter){
            await this.dbAdapter.close();
        }
        logger.info("*** SickleGraph service stopped ***");
    }

    private async initializeDatabase(){
        try {
            const dbPath = process.env.KUZU_DB_PATH;
            logger.info(`Initializing Kùzu database at ${dbPath}`);

            this.dbAdapter = new KuzuAdapter(dbPath);
            await this.dbAdapter.initialize();

            logger.info('Kùzu database initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Kùzu database:', error);
            throw error;
        }
    }
}