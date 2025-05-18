import { IAgentRuntime, logger, Service } from "@elizaos/core";
import { Neo4jAdapter } from "../db/kuzu-adapter";
import { ClinicalTrial, Gene, ResearchPaper, Variant } from "../types";
import { NCBIService } from "./ncbi-service";

/**
 * Core service for SickleGraph knowledge graph operations
 */
export class SickleGraphService extends Service {
    private dbAdapter: Neo4jAdapter;
    private initialized: boolean = false;
    private ncbiService: NCBIService;

    static serviceType = "sicklegraph";
    capabilityDescription = "SickleGraph knowledge graph for gene therapy innovation in Africa";

    constructor(protected runtime: IAgentRuntime) {
        super(runtime);
       
    }

    /**
     * Proper service initialization with database setup
     */
    static async create(runtime: IAgentRuntime): Promise<SickleGraphService> {
        const service = new SickleGraphService(runtime);
        await service.initializeDatabase();
        return service;
    }

    /**
     * Cleanup resources when service is stopped
     */
    async stop(): Promise<void> {
        try {
            if (this.dbAdapter) {
                logger.info('Closing database connection');
                await this.dbAdapter.close();
            }
            this.initialized = false;
            logger.info('SickleGraph service stopped');
        } catch (error) {
            logger.error('Error stopping SickleGraph service:', error);
            throw error;
        }
    }

    private async initializeDatabase(): Promise<void> {
        try {
            this.dbAdapter = new Neo4jAdapter({
                KUZU_DB_PATH: process.env.KUZU_DB_PATH || './data/sicklegraph.db'
            });

            await this.dbAdapter.initialize();
            await this.dbAdapter.initializeSchema();

             // Reinitialize NCBI service with the actual dbAdapter
             this.ncbiService = new NCBIService(this.dbAdapter);
             this.initialized = true;

            logger.info('SickleGraph service fully initialized');
        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw error;
        }
    }

    /**
     * Search genes by symbol, name or description
     */
    async searchGenes(query: string, limit: number = 10): Promise<Gene[]> {
        if (!this.initialized || !this.dbAdapter) throw new Error('Service not initialized');

        const searchQuery = `
            MATCH (g:Gene)
            WHERE g.symbol CONTAINS $query OR 
                  g.name CONTAINS $query OR
                  g.description CONTAINS $query
            RETURN g.*
            LIMIT $limit
        `;

        const result = await this.dbAdapter.executeQuery<Gene>(
            searchQuery,
            { query, limit }
        );
        return result.data;
    }

    /**
     * Get gene with related entities
     */
    async getGene(geneId: string): Promise<Gene & {
        variants?: Variant[];
        treatments?: any[];
        papers?: ResearchPaper[];
    }> {
        if (!this.initialized) throw new Error('Service not initialized');

        const query = `
            MATCH (g:Gene {id: $geneId})
            OPTIONAL MATCH (g)-[r:HAS_VARIANT]->(v:Variant)
            OPTIONAL MATCH (g)<-[t:TARGETED_BY]-(tr:Treatment)
            OPTIONAL MATCH (g)-[m:MENTIONED_IN]->(p:ResearchPaper)
            RETURN g.*, 
                   COLLECT(DISTINCT v.*) as variants,
                   COLLECT(DISTINCT {treatment: tr.*, efficacy: t.efficacy}) as treatments,
                   COLLECT(DISTINCT p.*) as papers
        `;

        const result = await this.dbAdapter.executeQuery(query, { geneId });
        return result.data[0];
    }

    /**
        * Find clinical trials targeting specific genetic variants
        */
    async findTrialsForVariant(variantId: string, region: string = 'Africa'): Promise<ClinicalTrial[]> {
        if (!this.initialized) throw new Error('Service not initialized');

        const query = `
            MATCH (v:Variant {id: $variantId})<-[:HAS_VARIANT]-(g:Gene)
            MATCH (g)<-[:TARGETS]-(t:ClinicalTrial)
            WHERE t.region CONTAINS $region OR t.multicentric = true
            RETURN t.*
            ORDER BY t.startDate DESC
        `;

        const result = await this.dbAdapter.executeQuery<ClinicalTrial>(
            query,
            { variantId, region }
        );
        return result.data;
    }

    /**
     * Search research papers with genetic context
     */
    async searchPapers(query: string, limit: number = 10): Promise<ResearchPaper[]> {
        if (!this.initialized) throw new Error('Service not initialized');

        const searchQuery = `
            MATCH (p:ResearchPaper)
            WHERE p.title CONTAINS $query OR 
                  ANY(author IN p.authors WHERE author CONTAINS $query)
            OPTIONAL MATCH (p)-[:MENTIONS]->(g:Gene)
            WITH p, COLLECT(g.symbol) as mentionedGenes
            RETURN p.*, mentionedGenes
            LIMIT $limit
        `;

        const result = await this.dbAdapter.executeQuery<ResearchPaper>(
            searchQuery,
            { query, limit }
        );
        return result.data;
    }

    /**
     * Import gene data from CSV
     */
    async importGeneData(csvData: string): Promise<void> {
        if (!this.initialized) throw new Error('Service not initialized');
        await this.dbAdapter.importGeneData(csvData);
    }
}