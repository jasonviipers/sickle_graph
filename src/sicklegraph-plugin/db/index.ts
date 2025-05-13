import * as kuzu from 'kuzu-wasm';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL is not defined')
}

export const db = kuzu.createDatabase(connectionString);
export const connection = new kuzu.connection(db);
