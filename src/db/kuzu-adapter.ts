import { logger } from '@elizaos/core';
import * as kuzu from '@kuzu/kuzu-wasm';
import { KnowledgeGraphResult } from '../types';
import { envSchema, type Env } from '../environment';

export class KuzuAdapter {
  private db: any;
  private conn: any;
  private config: Env;
  private queryCache: Map<string, { result: any, timestamp: number }> = new Map();
  private indexRegistry: Set<string> = new Set();

  constructor(config?: Partial<Env>) {
    this.config = envSchema.parse(config || {});
  }

  /**
    * Initialize database connection and setup virtual filesystem
    */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Kùzu WASM database');

      const kuzuModule = await kuzu.default();

      // Create in-memory or persistent database
      this.db = await kuzuModule.Database(this.config.KUZU_DB_PATH || ':memory:');
      this.conn = await kuzuModule.Connection(this.db);

      logger.info('Kùzu WASM database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Kùzu database:', error);
      throw error;
    }
  }

  /**
   * Safely inject parameters into a query string
   * @param query The query string with $param placeholders
   * @param params Object with parameter values
   * @returns Query string with parameters injected
   */
  private injectParams(query: string, params: Record<string, any>): string {
    let finalQuery = query;
    for (const [key, value] of Object.entries(params)) {
      // Handle different parameter types appropriately
      const paramValue = typeof value === 'string'
        ? `"${value.replace(/"/g, '\\"')}"`
        : value === null
          ? 'NULL'
          : value;

      finalQuery = finalQuery.replace(new RegExp(`\\$${key}\\b`, 'g'), paramValue);
    }
    return finalQuery;
  }

  /**
   * Execute a parameterized query against the graph database
   * @param query The Cypher query to execute
   * @param params Parameters for the query
   * @param options Query execution options
   * @returns Query result with metadata
   */
  async executeQuery<T = any>(
    query: string, 
    params: Record<string, any> = {}, 
    options: { 
      useCache?: boolean, 
      cacheTTL?: number,
      explain?: boolean
    } = {}
  ): Promise<KnowledgeGraphResult<T>> {
    try {
      const { useCache = false, cacheTTL = this.config.KNOWLEDGE_GRAPH_CACHE_TTL || 60, explain = false } = options;
      const cacheKey = `${query}-${JSON.stringify(params)}`;
      
      // Check cache if enabled
      if (useCache) {
        const cached = this.queryCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < cacheTTL * 1000) {
          logger.debug(`Using cached result for query: ${query}`);
          return cached.result;
        }
      }

      // Inject parameters directly into query for WASM compatibility
      const finalQuery = this.injectParams(query, params);
      
      // Optionally explain the query plan
      if (explain) {
        const explainQuery = `EXPLAIN ${finalQuery}`;
        const explainResult = await this.conn.execute(explainQuery);
        logger.debug(`Query plan: ${JSON.stringify(explainResult)}`);
      }
      
      // Execute the actual query
      logger.debug(`Executing Kùzu query: ${finalQuery}`);
      const result = await this.conn.execute(finalQuery);

      const data = JSON.parse(result.table.toString());
      const knowledgeResult: KnowledgeGraphResult<T> = {
        data,
        metadata: {
          queryTime: result.getStats().executionTime,
          resultCount: Array.isArray(data) ? data.length : 0,
          source: 'kuzu'
        }
      };
      
      // Cache the result if caching is enabled
      if (useCache) {
        this.queryCache.set(cacheKey, { 
          result: knowledgeResult, 
          timestamp: Date.now() 
        });
      }
      
      return knowledgeResult;
    } catch (error) {
      logger.error(`Error executing Kùzu query: ${query}`, error);
      throw error;
    }
  }

  /**
   * Clear the query cache
   * @param pattern Optional regex pattern to selectively clear cache entries
   */
  clearQueryCache(pattern?: RegExp): void {
    if (pattern) {
      for (const key of this.queryCache.keys()) {
        if (pattern.test(key)) {
          this.queryCache.delete(key);
        }
      }
      logger.debug(`Cleared query cache entries matching pattern: ${pattern}`);
    } else {
      this.queryCache.clear();
      logger.debug('Cleared all query cache entries');
    }
  }

  /**
   * Create an index on a node property to speed up queries
   * @param nodeLabel The node label to index
   * @param propertyName The property to index
   * @param indexType Type of index to create
   */
  async createIndex(
    nodeLabel: string, 
    propertyName: string, 
    indexType: 'hash' | 'btree' = 'btree'
  ): Promise<void> {
    try {
      const indexName = `idx_${nodeLabel}_${propertyName}`;
      const indexKey = `${nodeLabel}:${propertyName}`;
      
      // Check if index already exists
      if (this.indexRegistry.has(indexKey)) {
        logger.debug(`Index already exists for ${nodeLabel}.${propertyName}`);
        return;
      }
      
      // Create the index
      const query = `CREATE ${indexType.toUpperCase()} INDEX ${indexName} ON ${nodeLabel}(${propertyName})`;
      await this.executeQuery(query);
      
      // Register the index
      this.indexRegistry.add(indexKey);
      logger.info(`Created ${indexType} index on ${nodeLabel}.${propertyName}`);
    } catch (error) {
      logger.error(`Error creating index on ${nodeLabel}.${propertyName}:`, error);
      throw error;
    }
  }

  /**
   * Drop an index
   * @param nodeLabel The node label of the index
   * @param propertyName The property of the index
   */
  async dropIndex(nodeLabel: string, propertyName: string): Promise<void> {
    try {
      const indexName = `idx_${nodeLabel}_${propertyName}`;
      const indexKey = `${nodeLabel}:${propertyName}`;
      
      // Check if index exists
      if (!this.indexRegistry.has(indexKey)) {
        logger.debug(`No index exists for ${nodeLabel}.${propertyName}`);
        return;
      }
      
      // Drop the index
      const query = `DROP INDEX ${indexName}`;
      await this.executeQuery(query);
      
      // Remove from registry
      this.indexRegistry.delete(indexKey);
      logger.info(`Dropped index on ${nodeLabel}.${propertyName}`);
    } catch (error) {
      logger.error(`Error dropping index on ${nodeLabel}.${propertyName}:`, error);
      throw error;
    }
  }

  /**
   * Analyze database statistics to optimize query planning
   */
  async analyzeStatistics(): Promise<void> {
    try {
      await this.executeQuery('ANALYZE STATISTICS');
      logger.info('Database statistics analyzed for query optimization');
    } catch (error) {
      logger.error('Error analyzing database statistics:', error);
      throw error;
    }
  }

  /**
   * Optimize a query by analyzing and suggesting improvements
   * @param query The query to optimize
   * @returns Optimization suggestions
   */
  async optimizeQuery(query: string): Promise<string[]> {
    try {
      const suggestions: string[] = [];
      
      // Check for missing WHERE clauses in MATCH statements
      if (query.includes('MATCH') && !query.includes('WHERE')) {
        suggestions.push('Consider adding WHERE clauses to filter results early');
      }
      
      // Check for missing LIMIT clauses
      if (!query.includes('LIMIT')) {
        suggestions.push('Add LIMIT clause to prevent large result sets');
      }
      
      // Check for property access patterns that might benefit from indexing
      const propertyMatches = query.match(/\w+\.\w+/g) || [];
      for (const propMatch of propertyMatches) {
        const [nodeLabel, prop] = propMatch.split('.');
        if (prop && !this.indexRegistry.has(`${nodeLabel}:${prop}`)) {
          suggestions.push(`Consider creating an index on ${nodeLabel}.${prop}`);
        }
      }
      
      // Analyze the query plan
      const explainResult = await this.executeQuery(`EXPLAIN ${query}`, {}, { explain: false });
      
      return suggestions;
    } catch (error) {
      logger.error(`Error optimizing query: ${query}`, error);
      return ['Error analyzing query'];
    }
  }

  async writeFile(path: string, data: string | ArrayBufferView): Promise<void> {
    try {
      kuzu.FS.writeFile(path, data);
      logger.debug(`File written to virtual filesystem: ${path}`);
    } catch (error) {
      logger.error(`Error writing file ${path}`, error);
      throw error;
    }
  }

  async readFile(path: string): Promise<string> {
    try {
      const content = kuzu.FS.readFile(path, { encoding: 'utf8' });
      logger.debug(`File read from virtual filesystem: ${path}`);
      return content;
    } catch (error) {
      logger.error(`Error reading file ${path}`, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.conn) {
        logger.info('Closing Kùzu database connection');
        // In WASM version, connections might not need explicit closing
        // but we'll keep this for consistency
        this.conn = null;
      }
      this.db = null;
    } catch (error) {
      logger.error('Error closing Kùzu database:', error);
      throw error;
    }
  }

  // Schema creation methods
  async createNodeType(label: string, properties: Record<string, string>, primaryKey: string): Promise<void> {
    const propertiesStr = Object.entries(properties)
      .map(([name, type]) => `${name} ${type}`)
      .join(', ');

    const query = `CREATE NODE TABLE ${label}(${propertiesStr}, PRIMARY KEY (${primaryKey}))`;
    await this.executeQuery(query);
    
    // Automatically create an index on the primary key
    await this.createIndex(label, primaryKey);
  }

  async createRelationshipType(
    label: string,
    fromNode: string,
    toNode: string,
    properties: Record<string, string> = {}
  ): Promise<void> {
    const propertiesStr = properties && Object.entries(properties)
      .map(([name, type]) => `${name} ${type}`)
      .join(', ');

    const query = `CREATE REL TABLE ${label}(FROM ${fromNode} TO ${toNode}${propertiesStr ? `, ${propertiesStr}` : ''})`;
    await this.executeQuery(query);
  }

  // Data manipulation methods
  async addNode(label: string, properties: Record<string, any>): Promise<any> {
    const props = Object.entries(properties)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : v}`)
      .join(', ');

    const query = `CREATE (n:${label} {${props}}) RETURN n.*`;
    return this.executeQuery(query);
  }

  async addRelationship(
    label: string,
    fromNodeLabel: string,
    fromNodeId: string,
    toNodeLabel: string,
    toNodeId: string,
    properties: Record<string, any> = {}
  ): Promise<any> {
    const props = properties && Object.entries(properties)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? `"${v}"` : v}`)
      .join(', ');

    const query = `
      MATCH (a:${fromNodeLabel}), (b:${toNodeLabel})
      WHERE a.id = "${fromNodeId}" AND b.id = "${toNodeId}"
      CREATE (a)-[r:${label} ${props ? `{${props}}` : ''}]->(b)
      RETURN r
    `;

    return this.executeQuery(query);
  }

  async importCSV(nodeLabel: string, csvPath: string): Promise<any> {
    const query = `COPY ${nodeLabel} FROM "${csvPath}"`;
    return this.executeQuery(query);
  }


  /**
   * Initialize full biomedical schema from architecture document
   */
  async initializeFullSchema(): Promise<void> {
    try {
      // Core biological entities
      await this.createNodeType('Gene', {
        id: 'STRING',
        symbol: 'STRING',
        name: 'STRING',
        description: 'STRING',
        chromosome: 'STRING',
        ensemblId: 'STRING'
      }, 'id');

      await this.createNodeType('Variant', {
        id: 'STRING',
        hgvsNotation: 'STRING',
        clinicalSignificance: 'STRING',
        populationFrequency: 'FLOAT',
        variantType: 'STRING'
      }, 'id');

      // Clinical entities
      await this.createNodeType('Patient', {
        id: 'STRING',
        age: 'INT64',
        gender: 'STRING',
        ethnicity: 'STRING',
        location: 'STRING',
        genotype: 'STRING'
      }, 'id');

      // Research entities
      await this.createNodeType('ResearchPaper', {
        id: 'STRING',
        title: 'STRING',
        authors: 'STRING[]',
        publicationDate: 'DATE',
        journal: 'STRING',
        pmid: 'STRING'
      }, 'id');

      // Create relationships
      await this.createRelationshipType(
        'HAS_VARIANT',
        'Gene',
        'Variant',
        { frequency: 'FLOAT', clinicalImpact: 'STRING' }
      );

      await this.createRelationshipType(
        'TARGETED_BY',
        'Gene',
        'Treatment',
        { mechanism: 'STRING', efficacy: 'FLOAT' }
      );

      // Create additional indexes for common query patterns
      await this.createIndex('Gene', 'symbol');
      await this.createIndex('Gene', 'chromosome');
      await this.createIndex('Variant', 'clinicalSignificance');
      await this.createIndex('ResearchPaper', 'publicationDate');
      
      // Analyze statistics for query optimization
      await this.analyzeStatistics();

      logger.info('Full biomedical schema initialized with indexes');
    } catch (error) {
      logger.error('Error initializing schema:', error);
      throw error;
    }
  }

  async importGeneData(csvContent: string): Promise<void> {
    try {
      // Validate CSV structure
      const requiredColumns = ['id', 'symbol', 'name', 'chromosome'];
      const firstLine = csvContent.split('\n')[0];
      const headers = firstLine.split(',').map(h => h.trim());

      if (!requiredColumns.every(col => headers.includes(col))) {
        throw new Error(`CSV missing required columns. Needs: ${requiredColumns.join(', ')}`);
      }

      // Write to virtual filesystem
      await this.writeFile('/genes.csv', csvContent);

      // Import into database
      await this.executeQuery('COPY Gene FROM "/genes.csv"');
      
      // Refresh statistics after bulk import
      await this.analyzeStatistics();

      logger.info(`Imported ${headers.length} gene records`);
    } catch (error) {
      logger.error('Error importing gene data:', error);
      throw error;
    }
  }
}