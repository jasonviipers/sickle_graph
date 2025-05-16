# SickleGraph Plugin for ElizaOS

SickleGraph is a biomedical knowledge graph plugin for ElizaOS, focused on gene therapy research for sickle cell disease (SCD) with an emphasis on African applications. It integrates NCBI databases, provides advanced graph-based querying capabilities, and offers an AI-powered research assistant.

## Features

- **Knowledge Graph Integration**: Powered by Kùzu, supporting complex relationships between genes, variants, clinical trials, and research papers.
- **NCBI API Integration**: Connects to Gene, PubMed, and ClinVar databases with rate-limited requests and caching.
- **Research Assistant**: Natural language interface for querying biomedical data, with context-aware responses.
- **REST API**: Comprehensive endpoints for accessing all functionality programmatically.
- **African Context**: Prioritizes data and clinical trials relevant to African healthcare settings.

## Installation

### Prerequisites
- Node.js >= 18.x
- ElizaOS framework installed
- Kùzu WASM database
- NCBI API key (optional for enhanced rate limits)

# Deployment Guide

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