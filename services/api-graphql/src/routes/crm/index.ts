// Merges the per-entity CRM resolver maps into the shape mercurius
// expects ({ Query: {...}, Mutation: {...} }). graphql.ts imports
// `crmResolvers` and spreads both into the root schema's resolvers.

import { customerMutationResolvers, customerQueryResolvers } from './resolvers/customers.js';
import { dealMutationResolvers, dealQueryResolvers } from './resolvers/deals.js';
import { pipelineMutationResolvers, pipelineQueryResolvers } from './resolvers/pipelines.js';
import { b2bAccountMutationResolvers, b2bAccountQueryResolvers } from './resolvers/b2b-accounts.js';
import { activityMutationResolvers, activityQueryResolvers } from './resolvers/activities.js';
import { taskMutationResolvers, taskQueryResolvers } from './resolvers/tasks.js';
import { segmentMutationResolvers, segmentQueryResolvers } from './resolvers/segments.js';
import { reportQueryResolvers } from './resolvers/reports.js';

export { crmSdl } from './sdl.js';

export const crmResolvers = {
  Query: {
    ...customerQueryResolvers,
    ...dealQueryResolvers,
    ...pipelineQueryResolvers,
    ...b2bAccountQueryResolvers,
    ...activityQueryResolvers,
    ...taskQueryResolvers,
    ...segmentQueryResolvers,
    ...reportQueryResolvers,
  },
  Mutation: {
    ...customerMutationResolvers,
    ...dealMutationResolvers,
    ...pipelineMutationResolvers,
    ...b2bAccountMutationResolvers,
    ...activityMutationResolvers,
    ...taskMutationResolvers,
    ...segmentMutationResolvers,
  },
};
