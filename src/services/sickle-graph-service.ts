import { IAgentRuntime, logger, Service } from "@elizaos/core";
import { KuzuAdapter } from "../db/kuzu-adapter";
import { ClinicalTrial, Gene, ResearchPaper, Variant } from "../types";
import { NCBIService } from "./ncbi-service";
import { GeneQuery, PaperQuery } from "src/environment";

/**
 * Core service for SickleGraph knowledge graph operations
 */
export class SickleGraphService extends Service {
    private dbAdapter: KuzuAdapter;
    private initialized: boolean = false;
    private ncbiService: NCBIService;

    static serviceType = "sicklegraph";
    capabilityDescription = "SickleGraph knowledge graph for gene therapy innovation in Africa";

    constructor(protected runtime: IAgentRuntime) {
        super(runtime);
        this.config = {
            KUZU_DB_PATH: runtime.getSetting('KUZU_DB_PATH'),
            NCBI_API_KEY: runtime.getSetting('NCBI_API_KEY'),
            NCBI_BASE_URL: runtime.getSetting('NCBI_BASE_URL'),
            KNOWLEDGE_GRAPH_CACHE_TTL: runtime.getSetting('KNOWLEDGE_GRAPH_CACHE_TTL'),
        };
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
            this.dbAdapter = new KuzuAdapter({
                KUZU_DB_PATH: this.config.KUZU_DB_PATH,
            });

            await this.dbAdapter.initialize();
            await this.dbAdapter.initializeFullSchema();

            await this.createDatabaseIndexes();

            // Reinitialize NCBI service with the actual dbAdapter
            this.ncbiService = new NCBIService(this.runtime);
            this.initialized = true;

            logger.info('SickleGraph service fully initialized');
        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw error;
        }
    }
    /**
   * Create database indexes for common query patterns
   */
    private async createDatabaseIndexes(): Promise<void> {
        try {
            logger.info('Creating database indexes for common query patterns');

            // Gene indexes
            await this.dbAdapter.executeQuery('CREATE INDEX ON Gene(symbol)');
            await this.dbAdapter.executeQuery('CREATE INDEX ON Gene(name)');
            await this.dbAdapter.executeQuery('CREATE INDEX ON Gene(description)');
            await this.dbAdapter.executeQuery('CREATE INDEX ON Gene(chromosome)');
            await this.dbAdapter.executeQuery('CREATE INDEX ON Gene(id)');

            // Variant indexes
            await this.dbAdapter.executeQuery('CREATE INDEX ON Variant(id)');

            // ResearchPaper indexes
            await this.dbAdapter.executeQuery('CREATE INDEX ON ResearchPaper(title)');
            await this.dbAdapter.executeQuery('CREATE INDEX ON ResearchPaper(journal)');
            await this.dbAdapter.executeQuery('CREATE INDEX ON ResearchPaper(publicationDate)');

            // ClinicalTrial indexes
            await this.dbAdapter.executeQuery('CREATE INDEX ON ClinicalTrial(region)');
            await this.dbAdapter.executeQuery('CREATE INDEX ON ClinicalTrial(status)');
            await this.dbAdapter.executeQuery('CREATE INDEX ON ClinicalTrial(startDate)');

            // Disease indexes
            await this.dbAdapter.executeQuery('CREATE INDEX ON Disease(name)');

            logger.info('Database indexes created successfully');
        } catch (error) {
            logger.error('Error creating database indexes:', error);
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
     * Advance search for genes, variants, and research papers
     */
    async searchPapersAdvanced(query: PaperQuery): Promise<ResearchPaper[]> {
        if (!this.initialized) throw new Error('Service not initialized');

        const { keyword, journal, author, fromDate, toDate, mentionsGene, limit = 10, offset = 0 } = query;
        let whereClauses = [];

        if (keyword) whereClauses.push(`(p.title CONTAINS $keyword OR p.abstract CONTAINS $keyword)`);
        if (journal) whereClauses.push(`p.journal CONTAINS $journal`);
        if (author) whereClauses.push(`ANY(a IN p.authors WHERE a CONTAINS $author)`);
        if (fromDate) whereClauses.push(`p.publicationDate >= $fromDate`);
        if (toDate) whereClauses.push(`p.publicationDate <= $toDate`);

        let matchClause = `MATCH (p:ResearchPaper)`;
        if (mentionsGene) {
            matchClause += `\nMATCH (p)-[:MENTIONS]->(g:Gene)`;
            whereClauses.push(`g.symbol CONTAINS $mentionsGene`);
        }

        const searchQuery = `
            ${matchClause}
            ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
            OPTIONAL MATCH (p)-[:MENTIONS]->(g:Gene)
            WITH p, COLLECT(g.symbol) as mentionedGenes
            RETURN p.*, mentionedGenes
            ORDER BY p.publicationDate DESC
            LIMIT $limit
            SKIP $offset
        `;

        const result = await this.dbAdapter.executeQuery<ResearchPaper>(
            searchQuery,
            { ...query, limit, offset }
        );
        return result.data;
    }

    /**
     * Get total count for pagination
     * @param entityType The entity type to count
     * @param filterQuery The filter query to apply
     */
    async getEntityCount(entityType: string, filterQuery: Record<string, any> = {}): Promise<number> {
        if (!this.initialized) throw new Error('Service not initialized');

        let whereClauses = [];
        let matchClause = `MATCH (e:${entityType})`;

        // Build WHERE clauses based on filter parameters
        for (const [key, value] of Object.entries(filterQuery)) {
            if (value !== undefined && value !== null) {
                if (typeof value === 'string') {
                    whereClauses.push(`e.${key} CONTAINS $${key}`);
                } else {
                    whereClauses.push(`e.${key} = $${key}`);
                }
            }
        }

        const countQuery = `
        ${matchClause}
        ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
        RETURN COUNT(e) as count
    `;

        const result = await this.dbAdapter.executeQuery<{ count: number }>(
            countQuery,
            filterQuery
        );

        return result.data[0]?.count || 0;
    }

    /**
     * Enhanced version of searchGenesAdvanced with more filtering options
     */
    async searchGenesAdvanced(query: GeneQuery): Promise<Gene[]> {
        const { symbol, chromosome, keyword, associatedDisease, hasClinicalTrials, limit = 10, offset = 0 } = query;
        let whereClauses = [];
        if (symbol) whereClauses.push(`g.symbol CONTAINS $symbol`);
        if (chromosome) whereClauses.push(`g.chromosome = $chromosome`);
        if (keyword) whereClauses.push(`(g.description CONTAINS $keyword OR g.name CONTAINS $keyword)`);

        let matchClause = `MATCH (g:Gene)`;

        // Add disease association filter if specified
        if (associatedDisease) {
            matchClause += `\nMATCH (g)-[:ASSOCIATED_WITH]->(d:Disease)`;
            whereClauses.push(`d.name CONTAINS $associatedDisease`);
        }

        // Add clinical trials filter if specified
        if (hasClinicalTrials === true) {
            matchClause += `\nMATCH (g)<-[:TARGETS]-(t:ClinicalTrial)`;
        }

        const searchQuery = `
        ${matchClause}
        ${whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : ''}
        RETURN DISTINCT g.*
        ORDER BY g.symbol
        LIMIT $limit
        SKIP $offset
    `;

        return this.dbAdapter.executeQuery<Gene>(searchQuery, { ...query, limit, offset }).then(r => r.data);
    }
    /**
     * Import gene data from CSV
     */
    async importGeneData(csvData: string): Promise<void> {
        if (!this.initialized) throw new Error('Service not initialized');
        await this.dbAdapter.importGeneData(csvData);
    }

    /**
    * Get the database adapter instance
    */
    getDbAdapter(): KuzuAdapter {
        if (!this.dbAdapter) {
            throw new Error('Database adapter not initialized');
        }
        return this.dbAdapter;
    }
}