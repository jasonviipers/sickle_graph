import { logger } from '@elizaos/core';
import * as kuzu from '@kuzu/kuzu-wasm';
import { KnowledgeGraphResult } from '../types';
import { envSchema, type Env } from '../environment';

export class KuzuAdapter {
  private db: any;
  private conn: any;
  private config: Env;

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
     */
  async executeQuery<T = any>(query: string, params: Record<string, any> = {}): Promise<KnowledgeGraphResult<T>> {
    try {
      logger.debug(`Executing Kùzu query: ${query}`);

      // Inject parameters directly into query for WASM compatibility
      const finalQuery = this.injectParams(query, params);
      const result = await this.conn.execute(finalQuery);

      const data = JSON.parse(result.table.toString());
      return {
        data,
        metadata: {
          queryTime: result.getStats().executionTime,
          resultCount: Array.isArray(data) ? data.length : 0,
          source: 'kuzu'
        }
      };
    } catch (error) {
      logger.error(`Error executing Kùzu query: ${query}`, error);
      throw error;
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

      logger.info('Full biomedical schema initialized');
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

      logger.info(`Imported ${headers.length} gene records`);
    } catch (error) {
      logger.error('Error importing gene data:', error);
      throw error;
    }
  }
}