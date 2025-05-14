import { logger } from '@elizaos/core';
import * as kuzu from 'kuzu-wasm';
import { Config, configSchema } from '../types';

export class KuzuAdapter {
  private db: any; // Type will depend on Kùzu's TypeScript definitions
  private config: Config;

  constructor(config?:Partial<Config>) {
    this.config = configSchema.parse(config || {});
    this.db = kuzu.createDatabase(this.config.KUZU_DB_PATH);
  }

  async initialize(): Promise<void> {
    try {
      logger.info(`Initializing Kùzu database at ${this.config.KUZU_DB_PATH}`);
      this.db = new kuzu.connection(this.db);
      logger.info('Kùzu database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Kùzu database:', error);
      throw error;
    }
  }

  async executeQuery(query: string, params: Record<string, any> = {}): Promise<any> {
    try {
      logger.debug(`Executing Kùzu query: ${query}`);
      const connection = this.db.getConnection();
      const result = await connection.query(query, params);
      return result;
    } catch (error) {
      logger.error(`Error executing Kùzu query: ${query}`, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.db) {
        logger.info('Closing Kùzu database connection');
        await this.db.close();
      }
    } catch (error) {
      logger.error('Error closing Kùzu database:', error);
      throw error;
    }
  }

  // Schema creation methods
  async createNodeType(label: string, properties: Record<string, string>): Promise<void> {
    const propertiesStr = Object.entries(properties)
      .map(([name, type]) => `${name} ${type}`)
      .join(', ');

    const query = `CREATE NODE TABLE ${label} (${propertiesStr})`;
    await this.executeQuery(query);
  }

  async createRelationshipType(
    label: string,
    fromNode: string,
    toNode: string,
    properties: Record<string, string> = {}
  ): Promise<void> {
    const propertiesStr = Object.entries(properties)
      .map(([name, type]) => `${name} ${type}`)
      .join(', ');

    const query = `CREATE REL TABLE ${label} (
      FROM ${fromNode} TO ${toNode}${propertiesStr ? `, ${propertiesStr}` : ''}
    )`;
    await this.executeQuery(query);
  }

  // Data manipulation methods
  async addNode(label: string, properties: Record<string, any>): Promise<any> {
    const keys = Object.keys(properties);
    const values = Object.values(properties);

    const query = `
      CREATE (n:${label} {${keys.map(k => `${k}: $${k}`).join(', ')}})
      RETURN n
    `;

    const params = keys.reduce((acc, key, index) => {
      acc[key] = values[index];
      return acc;
    }, {} as Record<string, any>);

    return this.executeQuery(query, params);
  }

  async addRelationship(
    label: string,
    fromNodeLabel: string,
    fromNodeId: string,
    toNodeLabel: string,
    toNodeId: string,
    properties: Record<string, any> = {}
  ): Promise<any> {
    const keys = Object.keys(properties);
    const values = Object.values(properties);

    const query = `
      MATCH (a:${fromNodeLabel}), (b:${toNodeLabel})
      WHERE a.id = $fromId AND b.id = $toId
      CREATE (a)-[r:${label} {${keys.map(k => `${k}: $${k}`).join(', ')}}]->(b)
      RETURN r
    `;

    const params = {
      fromId: fromNodeId,
      toId: toNodeId,
      ...keys.reduce((acc, key, index) => {
        acc[key] = values[index];
        return acc;
      }, {} as Record<string, any>)
    };

    return this.executeQuery(query, params);
  }
}