import { logger } from '@elizaos/core';
import neo4j, { Driver, Result, QueryResult, Record } from 'neo4j-driver';
import { KnowledgeGraphResult, Gene, Variant, ClinicalTrial, ResearchPaper } from '../types';
import { envSchema, GeneQuery, PaperQuery, type Env } from '../environment';

export class Neo4jAdapter {
  private driver: Driver | null = null;
  private config: Env;
  private queryCache: Map<string, { result: any, timestamp: number }> = new Map();
  private indexRegistry: Set<string> = new Set();

  constructor(config?: Partial<Env>) {
    this.config = envSchema.parse(config || {});
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Neo4j database connection');

      const { NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } = this.config;

      if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
        throw new Error('Neo4j configuration is incomplete');
      }

      this.driver = neo4j.driver(
        NEO4J_URI,
        neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
        {
          maxConnectionPoolSize: 50,
          connectionTimeout: 30000,
          connectionAcquisitionTimeout: 60000
        }
      );

      await this.driver.verifyConnectivity();
      logger.info('Neo4j database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Neo4j database:', error);
      throw error;
    }
  }

  async executeQuery<T = any>(
    query: string,
    params: any = {},
    options: { 
      useCache?: boolean, 
      cacheTTL?: number,
      explain?: boolean
    } = {}
  ): Promise<KnowledgeGraphResult<T>> {
    if (!this.driver) {
      throw new Error('Database not initialized');
    }

    const session = this.driver.session();
    try {
      const { useCache = false, cacheTTL = this.config.KNOWLEDGE_GRAPH_CACHE_TTL || 60, explain = false } = options;
      const cacheKey = `${query}-${JSON.stringify(params)}`;
      
      if (useCache) {
        const cached = this.queryCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < cacheTTL * 1000) {
          logger.debug(`Using cached result for query: ${query}`);
          return cached.result;
        }
      }

      if (explain) {
        const explainResult = await session.run(`EXPLAIN ${query}`, params);
        logger.debug(`Query plan: ${JSON.stringify(explainResult.records.map(r => r.toObject()))}`);
      }

      logger.debug(`Executing Neo4j query: ${query} with params: ${JSON.stringify(params)}`);
      const result = await session.run(query, params);
      
      const data = result.records.map(record => {
        const obj: { [key: string]: any } = {};
        record.keys.forEach(key => {
          obj[String(key)] = this.convertNeo4jTypes(record.get(key));
        });
        return obj as T;
      });

      const knowledgeResult: KnowledgeGraphResult<T> = {
        data,
        metadata: {
          queryTime: result.summary.resultAvailableAfter.toNumber(),
          resultCount: data.length,
          source: 'neo4j',
          // summary: {
          //   queryText: result.summary.query.text,
          //   statistics: result.summary.counters.updates()
          // }
        }
      };

      if (useCache) {
        this.queryCache.set(cacheKey, { 
          result: knowledgeResult, 
          timestamp: Date.now() 
        });
      }
      
      return knowledgeResult;
    } catch (error) {
      logger.error(`Error executing Neo4j query: ${query}`, error);
      throw error;
    } finally {
      await session.close();
    }
  }

  private convertNeo4jTypes(value: any): any {
    if (neo4j.isInt(value)) return value.toNumber();
    if (value instanceof neo4j.types.Node) {
      return { ...value.properties, id: value.identity.toString() };
    }
    if (value instanceof neo4j.types.Relationship) {
      return { 
        ...value.properties, 
        id: value.identity.toString(),
        startNodeId: value.start.toString(),
        endNodeId: value.end.toString()
      };
    }
    if (Array.isArray(value)) return value.map(v => this.convertNeo4jTypes(v));
    return value;
  }

  async close(): Promise<void> {
    try {
      if (this.driver) {
        logger.info('Closing Neo4j database connection');
        await this.driver.close();
        this.driver = null;
      }
    } catch (error) {
      logger.error('Error closing Neo4j database:', error);
      throw error;
    }
  }

  // Biomedical-specific methods
  async getGenes(query: GeneQuery): Promise<KnowledgeGraphResult<Gene>> {
    const { symbol, chromosome, keyword, limit = 10, offset = 0 } = query;
    
    let whereClauses = [];
    const params: { [key: string]: any } = { limit, offset };

    if (symbol) {
      whereClauses.push('g.symbol = $symbol');
      params.symbol = symbol;
    }
    if (chromosome) {
      whereClauses.push('g.chromosome = $chromosome');
      params.chromosome = chromosome;
    }
    if (keyword) {
      whereClauses.push('(g.name CONTAINS $keyword OR g.description CONTAINS $keyword)');
      params.keyword = keyword;
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const queryStr = `
      MATCH (g:Gene)
      ${where}
      RETURN g
      SKIP $offset
      LIMIT $limit
    `;

    return this.executeQuery<Gene>(queryStr, params);
  }

  async getVariantsByGene(geneId: string): Promise<KnowledgeGraphResult<Variant>> {
    const query = `
      MATCH (g:Gene {id: $geneId})-[:HAS_VARIANT]->(v:Variant)
      RETURN v
    `;
    return this.executeQuery<Variant>(query, { geneId });
  }

  async getClinicalTrialsForGene(geneSymbol: string): Promise<KnowledgeGraphResult<ClinicalTrial>> {
    const query = `
      MATCH (g:Gene {symbol: $geneSymbol})-[:TARGETED_BY]->(t:Treatment)<-[:USES]-(ct:ClinicalTrial)
      RETURN ct
    `;
    return this.executeQuery<ClinicalTrial>(query, { geneSymbol });
  }

  async getResearchPapers(query: PaperQuery): Promise<KnowledgeGraphResult<ResearchPaper>> {
    const { keyword, journal, author, mentionsGene, limit = 10, offset = 0 } = query;
    
    let whereClauses = [];
    const params: { [key: string]: any } = { limit, offset };

    if (keyword) {
      whereClauses.push('(p.title CONTAINS $keyword OR p.abstract CONTAINS $keyword)');
      params.keyword = keyword;
    }
    if (journal) {
      whereClauses.push('p.journal = $journal');
      params.journal = journal;
    }
    if (author) {
      whereClauses.push('ANY(a IN p.authors WHERE a CONTAINS $author)');
      params.author = author;
    }
    if (mentionsGene) {
      whereClauses.push('EXISTS((p)-[:MENTIONS]->(:Gene {symbol: $mentionsGene}))');
      params.mentionsGene = mentionsGene;
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const queryStr = `
      MATCH (p:ResearchPaper)
      ${where}
      RETURN p
      SKIP $offset
      LIMIT $limit
    `;

    return this.executeQuery<ResearchPaper>(queryStr, params);
  }

  // Schema initialization
  async initializeSchema(): Promise<void> {
    try {
      // Create node types
      await this.executeQuery(`
        CREATE CONSTRAINT gene_id_unique IF NOT EXISTS
        FOR (g:Gene) REQUIRE g.id IS UNIQUE
      `);

      await this.executeQuery(`
        CREATE CONSTRAINT variant_id_unique IF NOT EXISTS
        FOR (v:Variant) REQUIRE v.id IS UNIQUE
      `);

      await this.executeQuery(`
        CREATE CONSTRAINT treatment_id_unique IF NOT EXISTS
        FOR (t:Treatment) REQUIRE t.id IS UNIQUE
      `);

      // Create indexes
      await this.executeQuery('CREATE INDEX FOR (g:Gene) ON (g.symbol)');
      await this.executeQuery('CREATE INDEX FOR (g:Gene) ON (g.chromosome)');
      await this.executeQuery('CREATE INDEX FOR (v:Variant) ON (v.clinicalSignificance)');

      logger.info('Database schema initialized');
    } catch (error) {
      logger.error('Error initializing schema:', error);
      throw error;
    }
  }

  // Data import from API (example)
  async importGeneFromAPI(geneData: Gene): Promise<void> {
    const query = `
      MERGE (g:Gene {id: $id})
      SET g += $properties
    `;
    await this.executeQuery(query, {
      id: geneData.id,
      properties: {
        symbol: geneData.symbol,
        name: geneData.name,
        chromosome: geneData.chromosome,
        ensemblId: geneData.ensemblId,
        description: geneData.description
      }
    });
  }

  async importVariantFromAPI(variantData: Variant): Promise<void> {
    if (!variantData.geneId) {
      throw new Error('Variant must have a geneId');
    }

    const query = `
      MATCH (g:Gene {id: $geneId})
      MERGE (v:Variant {id: $id})
      SET v += $properties
      MERGE (g)-[r:HAS_VARIANT]->(v)
      SET r.frequency = $frequency
    `;
    await this.executeQuery(query, {
      geneId: variantData.geneId,
      id: variantData.id,
      properties: {
        hgvsNotation: variantData.hgvsNotation,
        clinicalSignificance: variantData.clinicalSignificance,
        populationFrequency: variantData.populationFrequency,
        variantType: variantData.variantType
      },
      frequency: variantData.populationFrequency || 0
    });
  }
}



// import { logger } from '@elizaos/core';
// import neo4j, { Driver, Session, Result, Record, auth, types } from 'neo4j-driver';
// import { KnowledgeGraphResult } from '../types';
// import { envSchema, type Env } from '../environment';
// import * as dotenv from 'dotenv';
// dotenv.config();

// interface Config {
//   KUZU_DB_PATH?: string;
//   NCBI_API_KEY?: string;
//   NCBI_BASE_URL?: string;
//   KNOWLEDGE_GRAPH_CACHE_TTL?: number;
//   NEO4J_URI?: string; // Add this line
//   NEO4J_USERNAME?: string; 
//   NEO4J_PASSWORD?: string; 
// }

// /**
//  * Neo4j database adapter providing type-safe operations for the Eliza knowledge graph
//  */
// export class Neo4jAdapter {
//   importGeneData(csvData: string) {
//       throw new Error("Method not implemented.");
//   }
//   initializeFullSchema() {
//       throw new Error("Method not implemented.");
//   }
//   close() {
//       throw new Error("Method not implemented.");
//   }
//   private driver: Driver | null = null;
//   private config: Env;
//   private queryCache: Map<string, { result: KnowledgeGraphResult<any>, timestamp: number }> = new Map();
//   private indexRegistry: Set<string> = new Set();

//   constructor(config?: Partial<Env>) {
//     this.config = envSchema.parse(config || {});
//   }

//   async initialize(): Promise<void> {
//     try {
//       logger.info('Initializing Neo4j database connection');

//       this.driver = neo4j.driver(
//         this.config.NEO4J_URI || 'bolt://localhost:7687',
//         auth.basic(
//           this.config.NEO4J_USERNAME || 'neo4j',
//           this.config.NEO4J_PASSWORD || ''
//         ),
//         {
//           maxConnectionPoolSize: 50,
//           connectionTimeout: 30000,
//           connectionAcquisitionTimeout: 60000
//         }
//       );

//       await this.driver.verifyConnectivity();
//       logger.info('Neo4j database connected successfully');
//     } catch (error) {
//       logger.error('Failed to initialize Neo4j database:', error);
//       throw new Error(`Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
//     }
//   }

//   async executeQuery<T = Record<any, string>>(
//     query: string,
//     params: Record<any, string> = {},
//     options: {
//       useCache?: boolean;
//       cacheTTL?: number;
//       explain?: boolean;
//       write?: boolean;
//     } = {}
//   ): Promise<KnowledgeGraphResult<T>> {
//     if (!this.driver) throw new Error('Database not initialized');

//     try {
//       const { useCache = false, cacheTTL = this.config.KNOWLEDGE_GRAPH_CACHE_TTL || 60, explain = false, write = false } = options;
//       const cacheKey = `${query}-${JSON.stringify(params)}`;

//       if (useCache) {
//         const cached = this.queryCache.get(cacheKey);
//         if (cached && (Date.now() - cached.timestamp) < cacheTTL * 1000) {
//           logger.debug(`Using cached result for query: ${query}`);
//           return cached.result;
//         }
//       }

//       const session = this.driver.session({
//         defaultAccessMode: write ? neo4j.session.WRITE : neo4j.session.READ
//       });

//       try {
//         if (explain) {
//           const explainResult = await session.run(`EXPLAIN ${query}`, params);
//           logger.debug(`Query plan: ${JSON.stringify(explainResult.records.map(r => r.toObject()))}`);
//         }

//         logger.debug(`Executing Neo4j query: ${query}`);
//         const result = await session.run(query, params);

//         const data = this.formatResultRecords<T>(result);
//         const knowledgeResult: KnowledgeGraphResult<T> = {
//           data,
//           metadata: {
//             queryTime: result.summary.resultAvailableAfter.toNumber(),
//             resultCount: (await data).length,
//             source: 'neo4j'
//           }
//         };

//         if (useCache) {
//           this.queryCache.set(cacheKey, {
//             result: knowledgeResult,
//             timestamp: Date.now()
//           });
//         }

//         return knowledgeResult;
//       } finally {
//         await session.close();
//       }
//     } catch (error) {
//       logger.error(`Error executing Neo4j query: ${query}`, error);
//       throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
//     }
//   }

//   private async formatResultRecords<T>(result: Result): Promise<T[]> {
//     return (await result).records.map(record => {
//       const obj: Record<any, string> = {};
//       record.keys.forEach(key => {
//         obj[key] = this.convertNeo4jTypes(record.get(key));
//       });
//       return obj as T;
//     });
//   }

//   private convertNeo4jTypes(value: unknown): unknown {
//     if (neo4j.isInt(value)) return value.toNumber();
//     if (value instanceof types.Node) {
//       return {
//         ...value.properties,
//         id: value.identity.toString(),
//         _labels: value.labels
//       };
//     }
//     if (value instanceof types.Relationship) {
//       return {
//         ...value.properties,
//         id: value.identity.toString(),
//         _type: value.type,
//         _from: value.start.toString(),
//         _to: value.end.toString()
//       };
//     }
//     if (value instanceof types.Path) {
//       return {
//         start: this.convertNeo4jTypes(value.start),
//         end: this.convertNeo4jTypes(value.end),
//         segments: value.segments.map(segment => ({
//           start: this.convertNeo4jTypes(segment.start),
//           relationship: this.convertNeo4jTypes(segment.relationship),
//           end: this.convertNeo4jTypes(segment.end)
//         }))
//       };
//     }
//     if (Array.isArray(value)) {
//       return value.map(v => this.convertNeo4jTypes(v));
//     }
//     if (value !== null && typeof value === 'object') {
//       return Object.fromEntries(
//         Object.entries(value).map(([k, v]) => [k, this.convertNeo4jTypes(v)])
//       );
//     }
//     return value;
//   }

//   clearQueryCache(pattern?: RegExp): void {
//     if (pattern) {
//       for (const key of this.queryCache.keys()) {
//         if (pattern.test(key)) {
//           this.queryCache.delete(key);
//         }
//       }
//       logger.debug(`Cleared query cache entries matching pattern: ${pattern}`);
//     } else {
//       this.queryCache.clear();
//       logger.debug('Cleared all query cache entries');
//     }
//   }

//   async createIndex(
//     label: string,
//     property: string,
//     indexType: 'btree' | 'text' | 'range' = 'btree'
//   ): Promise<void> {
//     try {
//       const indexKey = `${label}:${property}`;

//       if (this.indexRegistry.has(indexKey)) {
//         logger.debug(`Index already exists for ${label}.${property}`);
//         return;
//       }

//       const query = `CREATE ${indexType === 'text' ? 'TEXT' : ''} INDEX IF NOT EXISTS 
//                      FOR (n:${label}) ON (n.${property})`;
//       await this.executeQuery(query, {}, { write: true });

//       this.indexRegistry.add(indexKey);
//       logger.info(`Created index on ${label}.${property}`);
//     } catch (error) {
//       const message = `Error creating index on ${label}.${property}: ${error instanceof Error ? error.message : String(error)}`;
//       logger.error(message);
//       throw new Error(message);
//     }
//   }

//   async createFullTextIndex(
//     indexName: string,
//     labels: string[],
//     properties: string[]
//   ): Promise<void> {
//     try {
//       const query = `
//         CALL db.index.fulltext.createNodeIndex(
//           $indexName,
//           $labels,
//           $properties
//         )
//       `;

//       await this.executeQuery(query, {
//         indexName,
//         labels,
//         properties
//       }, { write: true });

//       logger.info(`Created full-text index ${indexName} for ${labels.join(',')}`);
//     } catch (error) {
//       const message = `Error creating full-text index: ${error instanceof Error ? error.message : String(error)}`;
//       logger.error(message);
//       throw new Error(message);
//     }
//   }

//   async createConstraint(
//     label: string,
//     property: string,
//     constraintType: 'UNIQUE' | 'NODE_KEY' = 'UNIQUE'
//   ): Promise<void> {
//     try {
//       const query = `CREATE CONSTRAINT IF NOT EXISTS 
//                     FOR (n:${label}) REQUIRE n.${property} IS ${constraintType}`;
//       await this.executeQuery(query, {}, { write: true });
//       logger.info(`Created ${constraintType} constraint on ${label}.${property}`);
//     } catch (error) {
//       const message = `Error creating constraint on ${label}.${property}: ${error instanceof Error ? error.message : String(error)}`;
//       logger.error(message);
//       throw new Error(message);
//     }
//   }

//   /**
//    * Gets an overview of all labels, relationship types, and property keys in the database.
//    */
//   async getSchemaOverview(): Promise<{
//     labels: string[];
//     relationshipTypes: string[];
//     propertyKeys: string[];
//   }> {
//     try {
//       const [labelsResult, relsResult, propsResult] = await Promise.all([
//         this.executeQuery<{ label: string }>('CALL db.labels()'),
//         this.executeQuery<{ relationshipType: string }>('CALL db.relationshipTypes()'),
//         this.executeQuery<{ propertyKey: string }>('CALL db.propertyKeys()')
//       ]);

//       return {
//         labels: labelsResult.data.map(d => d.label),
//         relationshipTypes: relsResult.data.map(d => d.relationshipType),
//         propertyKeys: propsResult.data.map(d => d.propertyKey)
//       };
//     } catch (error) {
//       logger.error('Failed to get schema overview:', error);
//       throw new Error('Could not retrieve schema overview');
//     }
//   }
// }
