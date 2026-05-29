// GraphQL resolver context type — mercurius merges every buildContext field
// into its own MercuriusContext, so a single `request: FastifyRequest`
// declaration lets every resolver receive the live request.

import type { MercuriusContext } from 'mercurius';

export type GqlContext = MercuriusContext;
