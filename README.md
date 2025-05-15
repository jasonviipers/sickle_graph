# Deployment Guide

## Prerequisites

- Node.js 18+


## Configuration

Environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| KUZU_DB_PATH | No | :memory: | Path to database file |
| NCBI_API_KEY | Yes | none | Path to ncbi api |
| NCBI_BASE_URL | Yes | https://eutils.ncbi.nlm.nih.gov/entrez/eutils/ | Path to ncbi api |
| LOG_LEVEL | No | info | Logging level |
| DB_POOL_SIZE | No | 5 | Database connection pool size |

## Deployment Options

### 1. Local Development

```bash
npm install
npm run dev