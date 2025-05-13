# SickleGraph Architecture

This document describes the architecture of SickleGraph, an AI-powered knowledge graph for gene therapy innovation in Africa.

## Overview

SickleGraph is a comprehensive system that integrates diverse biomedical data sources into a knowledge graph, provides a natural language interface for researchers, offers predictive capabilities to accelerate research, and exposes all functionality through a comprehensive API.

## Core Components

### 1. Knowledge Graph Database

The knowledge graph database is the core of SickleGraph. It stores and manages the complex biomedical relationships relevant to sickle cell disease (SCD) and gene therapy.

#### Schema

The knowledge graph schema defines the following node types:
- Gene: Represents a gene, such as HBB.
- Mutation: Represents a genetic mutation, such as HbSS.
- Treatment: Represents a treatment, such as CRISPR-Cas9.
- Paper: Represents a research paper.
- ClinicalTrial: Represents a clinical trial.
- Researcher: Represents a researcher.
- Institution: Represents an institution.
- Country: Represents a country.
- Continent: Represents a continent.
- Protein: Represents a protein.
- Pathway: Represents a biological pathway.
- Disease: Represents a disease.
- Symptom: Represents a symptom.
- Drug: Represents a drug.

The schema also defines relationships between these node types, such as:
- HAS_MUTATION: Connects a gene to a mutation.
- TARGETS: Connects a treatment to a gene.
- TREATS: Connects a treatment to a disease.
- AUTHORED_BY: Connects a paper to a researcher.
- AFFILIATED_WITH: Connects a researcher to an institution.
- LOCATED_IN: Connects an institution to a country.
- PART_OF: Connects a country to a continent.
- CITES: Connects a paper to another paper.
- CONDUCTED_BY: Connects a clinical trial to an institution.
- CONDUCTED_IN: Connects a clinical trial to a country.
- ENCODES: Connects a gene to a protein.
- PARTICIPATES_IN: Connects a protein to a pathway.
- REGULATES: Connects a gene to another gene.
- CAUSES: Connects a mutation to a disease.
- MANIFESTS_AS: Connects a disease to a symptom.
- INTERACTS_WITH: Connects a drug to a protein.

#### Database Adapters

SickleGraph supports two graph database backends:
- Kùzu: A lightweight, embeddable graph database.

The database adapters provide a unified interface for interacting with the graph database, regardless of the backend used.

### 2. Data Pipeline

The data pipeline is responsible for integrating diverse biomedical data sources into the knowledge graph.

#### Data Sources

SickleGraph integrates data from the following sources:
- PubMed: Research publications.
- ClinicalTrials.gov: Clinical trial registrations.

Additional data sources can be added by implementing the `DataSource` interface.

#### ETL Process

The data pipeline follows an Extract, Transform, Load (ETL) process:
1. Extract: Data is extracted from the source.
2. Transform: Data is transformed into a format suitable for the knowledge graph.
3. Load: Data is loaded into the knowledge graph.

### 3. ELIZA AI Research Assistant

The ELIZA AI Research Assistant provides a natural language interface for researchers to query the knowledge graph.

#### Query Processing

ELIZA processes queries in the following steps:
1. Language detection: Detects the language of the query.
2. Translation: Translates the query to English if necessary.
3. Query classification: Classifies the query as a graph query, literature query, clinical trial query, gene therapy query, African context query, or general query.
4. Query handling: Handles the query based on its classification.
5. Response generation: Generates a response based on the query results.
6. Translation: Translates the response to the original language if necessary.

#### Multilingual Support

ELIZA supports the following languages:
- English (en)
- Yoruba (yo)
- Hausa (ha)
- Igbo (ig)

### 4. Advanced Inference Engine

The Advanced Inference Engine provides predictive capabilities to accelerate research and discovery.

#### Prediction Tasks

The inference engine supports the following prediction tasks:
- Target Prioritization: Ranks potential gene therapy targets based on predicted efficacy.
- Off-target Analysis: Identifies potential unintended editing sites.
- Clinical Trial Matching: Connects patients with specific genetic profiles to suitable clinical trials.
- Outcome Prediction: Projects potential therapeutic outcomes based on genetic markers.

### 5. API Layer

The API Layer provides programmatic access to all SickleGraph functionalities.

#### Endpoints

The API provides the following endpoints:
- `/genes`: Get genes.
- `/genes/{gene_id}`: Get a gene by ID.
- `/treatments`: Get treatments.
- `/treatments/{treatment_id}`: Get a treatment by ID.
- `/clinical-trials`: Get clinical trials.
- `/clinical-trials/{trial_id}`: Get a clinical trial by ID.
- `/papers`: Get papers.
- `/papers/{paper_id}`: Get a paper by ID.
- `/eliza/query`: Query the ELIZA AI Research Assistant. 
- `/inference/predict-targets`: Predict gene therapy targets.
- `/inference/predict-off-targets`: Predict off-target effects.
- `/inference/match-trials`: Match clinical trials.
- `/inference/predict-treatment-outcome`: Predict treatment outcome.

## Component Interactions

The components of SickleGraph interact as follows:

1. The Data Pipeline extracts data from various sources, transforms it, and loads it into the Knowledge Graph Database.
2. The ELIZA AI Research Assistant queries the Knowledge Graph Database to answer user queries.
3. The Advanced Inference Engine uses the data in the Knowledge Graph Database to make predictions.
4. The API Layer provides access to all functionalities, including the ELIZA AI Research Assistant and the Advanced Inference Engine.

## Deployment

SickleGraph can be deployed in various ways:

1. Local deployment: SickleGraph can be deployed locally for development and testing.
2. Server deployment: SickleGraph can be deployed on a server for production use.
3. Cloud deployment: SickleGraph can be deployed on cloud platforms like AWS, Azure, or Google Cloud.

## Scalability

SickleGraph is designed to be scalable:

1. The Knowledge Graph Database can handle large amounts of data.
2. The Data Pipeline can process data from multiple sources in parallel.
3. The API Layer can handle multiple requests concurrently.