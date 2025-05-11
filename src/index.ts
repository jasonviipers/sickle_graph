import {
  logger,
  type Character,
  type IAgentRuntime,
  type Project,
  type ProjectAgent,
} from '@elizaos/core';
import dotenv from 'dotenv';
import starterPlugin from './plugin';
import { character } from './character/sicklegraph-agent';


const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('Initializing character');
  logger.info('Name: ', character.name);
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [starterPlugin],
};
const project: Project = {
  agents: [projectAgent],
};

export default project;