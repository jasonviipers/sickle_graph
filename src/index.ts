import {
  type IAgentRuntime,
  type Project,
  type ProjectAgent,
} from '@elizaos/core';
import starterPlugin from './plugin';
import { character, initCharacter } from './character/sicklegraph-agent';


export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [starterPlugin],
};
const project: Project = {
  agents: [projectAgent],
};

export default project;