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

    static async create(runtime: IAgentRuntime): Promise<SickleGraphService> {
        const service = new SickleGraphService(runtime);
        await service.initializeDatabase();
        return service;
    }

    static async stop(runtime: IAgentRuntime) {
        logger.info("*** Stopping SickleGraph service ***");
        const service = runtime.getService(SickleGraphService.serviceType);
        if (!service) {
            throw new Error("SickleGraph service not found");
        }
        await service.stop();
    }

    async stop() {
        if (this.dbAdapter) {
            await this.dbAdapter.close();
        }
        logger.info("*** SickleGraph service stopped ***");
    }

    private async initializeDatabase() {
        try {
            const dbPath = process.env.KUZU_DB_PATH || ':memory:';
            logger.info(`Initializing Kùzu database at ${dbPath}`);

            this.dbAdapter = new KuzuAdapter({ KUZU_DB_PATH: dbPath });
            await this.dbAdapter.initialize();

            // Initialize schema if needed
            await this.initializeSchema();

            logger.info('Kùzu database initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Kùzu database:', error);
            throw error;
        }
    }

    private async initializeSchema() {
        if (!this.dbAdapter) return;

        // Create node tables
        await this.dbAdapter.createNodeType('Gene', {
            id: 'STRING',
            name: 'STRING',
            description: 'STRING',
            chromosome: 'STRING'
        }, 'id');

        await this.dbAdapter.createNodeType('Variant', {
            id: 'STRING',
            name: 'STRING',
            clinicalSignificance: 'STRING',
            alleleFrequency: 'FLOAT'
        }, 'id');

        await this.dbAdapter.createNodeType('Patient', {
            id: 'STRING',
            age: 'INT64',
            gender: 'STRING',
            location: 'STRING'
        }, 'id');

        // Create relationship tables
        await this.dbAdapter.createRelationshipType(
            'HAS_VARIANT',
            'Gene',
            'Variant',
            { frequency: 'FLOAT' }
        );

        await this.dbAdapter.createRelationshipType(
            'TREATED_WITH',
            'Patient',
            'Gene',
            { outcome: 'STRING', date: 'DATE' }
        );
    }

    async importGeneData(csvData: string): Promise<void> {
        if (!this.dbAdapter) throw new Error('Database not initialized');
        
        // Write CSV to virtual filesystem
        await this.dbAdapter.writeFile('/genes.csv', csvData);
        
        // Import into database
        await this.dbAdapter.importCSV('Gene', '/genes.csv');
    }

    async queryGenes(pattern: string): Promise<any> {
        if (!this.dbAdapter) throw new Error('Database not initialized');
        
        const query = `
            MATCH (g:Gene)
            WHERE g.name CONTAINS "${pattern}" OR g.description CONTAINS "${pattern}"
            RETURN g.*
            LIMIT 100
        `;
        
        return this.dbAdapter.executeQuery(query);
    }

}