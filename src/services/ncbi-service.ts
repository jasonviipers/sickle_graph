import { IAgentRuntime, logger, Service } from '@elizaos/core';
import axios, { AxiosInstance } from 'axios';
import { KuzuAdapter } from '../db/kuzu-adapter';
import { NCBIOptions, Gene, ResearchPaper, ClinicalVariant } from '../types';
import { SickleGraphService } from './sickle-graph-service';

export class NCBIService extends Service {
    private readonly api: AxiosInstance;
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly rateLimit: number = 3;
    private lastRequestTime: number = 0;
    private dbAdapter: KuzuAdapter;

    static serviceType = "ncbi";
    capabilityDescription = "NCBI API integration service";

    constructor(runtime: IAgentRuntime) {
        super(runtime);
        this.config = {
            KUZU_DB_PATH: runtime.getSetting('KUZU_DB_PATH'),
            NCBI_API_KEY: runtime.getSetting('NCBI_API_KEY'),
            NCBI_BASE_URL: runtime.getSetting('NCBI_BASE_URL'),
            KNOWLEDGE_GRAPH_CACHE_TTL: runtime.getSetting('KNOWLEDGE_GRAPH_CACHE_TTL'),
        };
        this.apiKey = this.config.NCBI_API_KEY;
        this.baseUrl = this.config.NCBI_BASE_URL;

        // Initialize API client
        this.api = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            params: {
                api_key: this.apiKey,
                retmode: 'json'
            }
        });

        // Get shared dbAdapter from SickleGraphService
        const sicklegraphService = runtime.getService<SickleGraphService>(
            SickleGraphService.serviceType
        );

        if (!sicklegraphService) {
            throw new Error('SickleGraphService not available');
        }

        this.dbAdapter = sicklegraphService.getDbAdapter();
    }

    async initialize(): Promise<void> {
        try {
            await this.dbAdapter.initialize();
            await this.dbAdapter.initializeFullSchema();
            logger.info('NCBI service initialized');
        } catch (error) {
            logger.error('Failed to initialize NCBI service:', error);
            throw error;
        }
    }

    /**
     * Cleanup resources when service is stopped
     */
    async stop(): Promise<void> {
        try {
            await this.dbAdapter.close();
            logger.info('SickleGraph service stopped');
        } catch (error) {
            logger.error('Error stopping SickleGraph service:', error);
        }
    }

    // ==================== Core Methods ====================

    private async rateLimitedRequest<T>(config: any): Promise<T> {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        const minDelay = 1000 / this.rateLimit;

        if (elapsed < minDelay) {
            await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
        }

        this.lastRequestTime = Date.now();
        const response = await this.api.request<T>(config);
        return response.data;
    }

    private normalizeError(error: any): Error {
        if (axios.isAxiosError(error)) {
            return new Error(`NCBI API error: ${error.response?.status} ${error.response?.statusText}`);
        }
        return error instanceof Error ? error : new Error(String(error));
    }

    // ==================== Gene Methods ====================

    async searchGenes(query: string, options: {
        cacheFirst?: boolean;
        forceUpdate?: boolean;
        limit?: number;
    } = {}): Promise<Gene[]> {
        const { cacheFirst = true, forceUpdate = false, limit = 50 } = options;

        try {
            // Check cache first if enabled
            if (cacheFirst && !forceUpdate) {
                const cached = await this.getCachedGenes(query, limit);
                if (cached.length > 0) return cached;
            }

            // API call
            const searchData = await this.rateLimitedRequest<any>({
                url: '/esearch.fcgi',
                params: { db: 'gene', term: query, retmax: limit }
            });

            const geneIds = searchData?.esearchresult?.idlist || [];
            if (geneIds.length === 0) return [];

            // Fetch details and cache
            const details = await this.fetchGeneDetails(geneIds);
            await this.cacheGenes(details);

            return details.slice(0, limit);
        } catch (error) {
            logger.error('Gene search error:', error);
            if (cacheFirst) {
                const cached = await this.getCachedGenes(query, limit);
                if (cached.length > 0) return cached;
            }
            throw this.normalizeError(error);
        }
    }

    private async getCachedGenes(query: string, limit: number): Promise<Gene[]> {
        const result = await this.dbAdapter.executeQuery<Gene>(`
            MATCH (g:Gene)
            WHERE g.symbol CONTAINS $query OR 
                  g.name CONTAINS $query OR
                  g.description CONTAINS $query
            RETURN g
            ORDER BY g.lastUpdated DESC
            LIMIT $limit
        `, { query, limit });
        return result.data;
    }

    private async fetchGeneDetails(geneIds: string[]): Promise<Gene[]> {
        const details = await this.rateLimitedRequest<any>({
            url: '/esummary.fcgi',
            params: { db: 'gene', id: geneIds.join(',') }
        });

        return Object.values(details.result)
            .filter((item: any) => item.uid)
            .map(this.normalizeGeneData);
    }

    private normalizeGeneData(gene: any): Gene {
        return {
            id: gene.uid,
            symbol: gene.nomenclaturesymbol || '',
            name: gene.nomenclaturename || '',
            description: gene.description || gene.summary || '',
            chromosome: gene.chromosome || '',
            ensemblId: gene.otheraliases?.split('|').find((a: string) => a.startsWith('ENSG')) || '',
            // lastUpdated: new Date().toISOString()
        };
    }

    private async cacheGenes(genes: Gene[]): Promise<void> {
        await Promise.all(genes.map(gene => this.dbAdapter.executeQuery(`
            MERGE (g:Gene {id: $id})
            SET g += $properties
            `, {
            id: gene.id,
            properties: gene
        })));
    }

    // ==================== PubMed Methods ====================

    async searchPubMed(query: string, options: {
        cacheFirst?: boolean;
        forceUpdate?: boolean;
        limit?: number;
    } = {}): Promise<ResearchPaper[]> {
        const { cacheFirst = true, forceUpdate = false, limit = 50 } = options;

        try {
            // Check cache first
            if (cacheFirst && !forceUpdate) {
                const cached = await this.getCachedPapers(query, limit);
                if (cached.length > 0) return cached;
            }

            // API call
            const searchData = await this.rateLimitedRequest<any>({
                url: '/esearch.fcgi',
                params: { db: 'pubmed', term: query, retmax: limit }
            });

            const pmids = searchData?.esearchresult?.idlist || [];
            if (pmids.length === 0) return [];

            // Fetch details and cache
            const details = await this.fetchPaperDetails(pmids);
            await this.cachePapers(details);

            return details.slice(0, limit);
        } catch (error) {
            logger.error('PubMed search error:', error);
            if (cacheFirst) {
                const cached = await this.getCachedPapers(query, limit);
                if (cached.length > 0) return cached;
            }
            throw this.normalizeError(error);
        }
    }

    private async getCachedPapers(query: string, limit: number): Promise<ResearchPaper[]> {
        const result = await this.dbAdapter.executeQuery<ResearchPaper>(`
            MATCH (p:ResearchPaper)
            WHERE p.title CONTAINS $query OR 
                  ANY(author IN p.authors WHERE author CONTAINS $query) OR
                  p.abstract CONTAINS $query
            RETURN p
            ORDER BY p.publicationDate DESC
            LIMIT $limit
        `, { query, limit });
        return result.data;
    }

    private async fetchPaperDetails(pmids: string[]): Promise<ResearchPaper[]> {
        const details = await this.rateLimitedRequest<any>({
            url: '/efetch.fcgi',
            params: { db: 'pubmed', id: pmids.join(',') }
        });

        // This would be more sophisticated in a real implementation
        return pmids.map(pmid => ({
            id: pmid,
            title: `Paper ${pmid}`,
            authors: [],
            journal: '',
            publicationDate: new Date().toISOString(),
            abstract: '',
            pmid: pmid
        }));
    }

    private async cachePapers(papers: ResearchPaper[]): Promise<void> {
        await Promise.all(papers.map(paper =>
            this.dbAdapter.executeQuery(`
                MERGE (p:ResearchPaper {id: $id})
                SET p += $properties
            `, {
                id: paper.id,
                properties: paper
            })
        ));
    }

    // ==================== ClinVar Methods ====================

    async searchClinVar(query: string, options: {
        cacheFirst?: boolean;
        forceUpdate?: boolean;
        limit?: number;
    } = {}): Promise<ClinicalVariant[]> {
        const { cacheFirst = true, forceUpdate = false, limit = 50 } = options;

        try {
            // Check cache first
            if (cacheFirst && !forceUpdate) {
                const cached = await this.getCachedVariants(query, limit);
                if (cached.length > 0) return cached;
            }

            // API call
            const searchData = await this.rateLimitedRequest<any>({
                url: '/esearch.fcgi',
                params: { db: 'clinvar', term: query, retmax: limit }
            });

            const variantIds = searchData?.esearchresult?.idlist || [];
            if (variantIds.length === 0) return [];

            // Fetch details and cache
            const details = await this.fetchVariantDetails(variantIds);
            await this.cacheVariants(details);

            return details.slice(0, limit);
        } catch (error) {
            logger.error('ClinVar search error:', error);
            if (cacheFirst) {
                const cached = await this.getCachedVariants(query, limit);
                if (cached.length > 0) return cached;
            }
            throw this.normalizeError(error);
        }
    }

    private async getCachedVariants(query: string, limit: number): Promise<ClinicalVariant[]> {
        const result = await this.dbAdapter.executeQuery<ClinicalVariant>(`
            MATCH (v:ClinicalVariant)
            WHERE v.hgvsNotation CONTAINS $query OR
                  v.clinicalSignificance CONTAINS $query
            RETURN v
            ORDER BY v.lastUpdated DESC
            LIMIT $limit
        `, { query, limit });
        return result.data;
    }

    private async fetchVariantDetails(variantIds: string[]): Promise<ClinicalVariant[]> {
        const details = await this.rateLimitedRequest<any>({
            url: '/esummary.fcgi',
            params: { db: 'clinvar', id: variantIds.join(',') }
        });

        return Object.values(details.result)
            .filter((item: any) => item.uid)
            .map(this.normalizeVariantData);
    }

    private normalizeVariantData(variant: any): ClinicalVariant {
        return {
            id: variant.uid,
            hgvsNotation: variant.hgvs || '',
            clinicalSignificance: variant.clinical_significance?.description || 'unknown',
            geneSymbol: variant.gene?.symbol || '',
            lastEvaluated: variant.last_evaluated || '',
            reviewStatus: variant.review_status || '',
            lastUpdated: new Date().toISOString()
        };
    }

    private async cacheVariants(variants: ClinicalVariant[]): Promise<void> {
        await Promise.all(variants.map(variants => this.dbAdapter.executeQuery(`
            MERGE (v:ClinicalVariant {id: $id})
            SET v += $properties
            `, {
            id: variants.id,
            properties: variants
        })));
    }

    // ==================== Batch Methods ====================

    async batchSearch(query: string, options: {
        databases?: ('gene' | 'pubmed' | 'clinvar')[];
        limit?: number;
    } = {}): Promise<{
        genes?: Gene[];
        papers?: ResearchPaper[];
        variants?: ClinicalVariant[];
    }> {
        const { databases = ['gene', 'pubmed', 'clinvar'], limit = 10 } = options;

        const results: any = {};

        if (databases.includes('gene')) {
            results.genes = await this.searchGenes(query, { limit });
        }

        if (databases.includes('pubmed')) {
            results.papers = await this.searchPubMed(query, { limit });
        }

        if (databases.includes('clinvar')) {
            results.variants = await this.searchClinVar(query, { limit });
        }

        return results;
    }
}