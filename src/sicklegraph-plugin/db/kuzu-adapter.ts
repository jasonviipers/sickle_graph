import { logger } from '@elizaos/core';
import * as kuzu from '@kuzu/kuzu-wasm';
import { Config, configSchema } from '../environment';

export class KuzuAdapter {
  private db: any;
  private conn: any;
  private config: Config;

  constructor(config?: Partial<Config>) {
    this.config = configSchema.parse(config || {});
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Kùzu WASM database');
      
      // Initialize Kùzu WASM module
      const kuzuModule = await kuzu.default();
      
      // Create database and connection
      this.db = await kuzuModule.Database(this.config.KUZU_DB_PATH || ':memory:');
      this.conn = await kuzuModule.Connection(this.db);
      
      logger.info('Kùzu WASM database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Kùzu database:', error);
      throw error;
    }
  }

  async executeQuery(query: string, params: Record<string, any> = {}): Promise<any> {
    try {
      logger.debug(`Executing Kùzu query: ${query}`);
      
      // In WASM version, parameters might need to be embedded directly in the query
      // since the interface might be different from the native version
      const result = await this.conn.execute(query);
      
      // Convert result to JSON format
      return {
        data: JSON.parse(result.table.toString()),
        stats: result.getStats()
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
}