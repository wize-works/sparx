// CRM SDL.
//
// Merged into the root schema in graphql.ts. Field naming matches the wire
// shape from the Prisma models — callers selecting `totalSpent` get the same
// thing the REST GET /v1/crm/customers/:id returns under the same name. JSON
// blobs (metadata, gdprConsent, engineProfiles) are exposed as JSON scalar
// for flexibility; tightening to typed sub-objects can land later.

export const crmSdl = /* GraphQL */ `
  enum CustomerType {
    prospect
    retail
    b2b
  }
  enum B2BAccountStatus {
    active
    credit_hold
    suspended
    inactive
  }
  enum DealStageType {
    open
    won
    lost
  }
  enum TaskStatus {
    open
    completed
    cancelled
  }
  enum TaskPriority {
    low
    medium
    high
    urgent
  }
  enum ActivityActorType {
    staff
    customer
    system
    api
    mcp
  }

  type CrmCustomer {
    id: ID!
    type: CustomerType!
    email: String
    phone: String
    firstName: String
    lastName: String
    company: String
    jobTitle: String
    tags: [String!]!
    assignedRepId: ID
    b2bAccountId: ID
    doNotContact: Boolean!
    totalSpent: Float!
    orderCount: Int!
    firstOrderAt: DateTime
    lastOrderAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
    deletedAt: DateTime
  }
  type CustomerPage {
    items: [CrmCustomer!]!
    total: Int!
  }

  type B2BAccount {
    id: ID!
    companyName: String!
    taxId: String
    website: String
    pricingTier: String
    creditLimit: Float!
    creditUsed: Float!
    paymentTerms: String
    discountPercent: Float!
    status: B2BAccountStatus!
    assignedRepId: ID
    fleetSize: Int
    notes: String
    tags: [String!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  type B2BAccountPage {
    items: [B2BAccount!]!
    total: Int!
  }

  type PipelineStage {
    id: ID!
    pipelineId: ID!
    name: String!
    sortOrder: Int!
    probability: Float!
    stageType: DealStageType!
    color: String
  }
  type Pipeline {
    id: ID!
    name: String!
    slug: String!
    isDefault: Boolean!
    sortOrder: Int!
    archivedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
    stages: [PipelineStage!]!
  }

  type Deal {
    id: ID!
    pipelineId: ID!
    stageId: ID!
    customerId: ID
    b2bAccountId: ID
    title: String!
    value: Float!
    currency: String!
    probability: Float!
    expectedCloseDate: DateTime
    closedAt: DateTime
    closedReason: String
    assignedRepId: ID
    source: String
    tags: [String!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }
  type DealPage {
    items: [Deal!]!
    total: Int!
  }
  type ForecastBucket {
    month: String!
    openValue: Float!
    weightedValue: Float!
    closedWonValue: Float!
    dealCount: Int!
  }
  type ForecastResult {
    pipelineId: ID
    startMonth: String!
    endMonth: String!
    buckets: [ForecastBucket!]!
    totalWeighted: Float!
  }

  type CrmActivity {
    id: ID!
    customerId: ID
    dealId: ID
    b2bAccountId: ID
    type: String!
    description: String
    actorId: ID
    actorType: ActivityActorType!
    occurredAt: DateTime!
    linkedEntityType: String
    linkedEntityId: ID
    correctsActivityId: ID
    createdAt: DateTime!
  }

  type CrmTask {
    id: ID!
    title: String!
    description: String
    dueAt: DateTime
    priority: TaskPriority!
    assignedToUserId: ID!
    customerId: ID
    dealId: ID
    status: TaskStatus!
    completedAt: DateTime
    completedByUserId: ID
    createdByUserId: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Segment {
    id: ID!
    name: String!
    slug: String!
    description: String
    rules: JSON!
    color: String
    isSystem: Boolean!
    isBuiltIn: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    archivedAt: DateTime
  }
  type SegmentMember {
    segmentId: ID!
    customerId: ID!
    enteredAt: DateTime!
    score: Float
    customer: CrmCustomer
  }
  type SegmentPreviewCount {
    matches: Int!
    sampled: Int!
    total: Int!
  }

  type CrmSnapshot {
    customers: Int!
    b2bAccounts: Int!
    openDeals: Int!
    pipelineValue: Float!
    openTasks: Int!
    overdueTasks: Int!
  }
  type PipelineFunnelBucket {
    stageId: ID!
    stageName: String!
    stageType: DealStageType!
    count: Int!
    totalValue: Float!
  }
  type WinLossRow {
    repId: ID
    won: Int!
    lost: Int!
    open: Int!
    winRate: Float!
    totalWonValue: Float!
  }
  type AcquisitionPoint {
    month: String!
    newCustomers: Int!
  }

  extend type Query {
    crmCustomers(type: CustomerType, tag: String, q: String, take: Int, skip: Int): CustomerPage!
    crmCustomer(id: ID!): CrmCustomer
    crmTopCustomers(limit: Int, type: CustomerType): [CrmCustomer!]!
    crmInactiveCustomers(days: Int!, limit: Int): [CrmCustomer!]!

    b2bAccounts(status: B2BAccountStatus, q: String, take: Int, skip: Int): B2BAccountPage!
    b2bAccount(id: ID!): B2BAccount

    pipelines(includeArchived: Boolean): [Pipeline!]!
    pipeline(id: ID!): Pipeline

    deals(
      pipelineId: ID
      stageId: ID
      customerId: ID
      assignedRepId: ID
      state: String
      take: Int
      skip: Int
    ): DealPage!
    deal(id: ID!): Deal
    dealForecast(pipelineId: ID, startMonth: String, endMonth: String): ForecastResult!

    crmActivities(
      customerId: ID
      dealId: ID
      b2bAccountId: ID
      type: String
      since: DateTime
      until: DateTime
      limit: Int
    ): [CrmActivity!]!

    crmTasks(
      assignedToUserId: ID
      customerId: ID
      dealId: ID
      status: TaskStatus
      take: Int
    ): [CrmTask!]!
    crmTask(id: ID!): CrmTask
    crmOverdueTasks(userId: ID): [CrmTask!]!
    crmTodayTasks: [CrmTask!]!

    segments(includeArchived: Boolean): [Segment!]!
    segment(id: ID!): Segment
    segmentMembers(id: ID!, limit: Int, offset: Int): [SegmentMember!]!
    segmentMemberCount(id: ID!): Int!
    previewSegmentCount(rule: JSON!, sampleSize: Int): SegmentPreviewCount!

    crmSnapshot: CrmSnapshot!
    pipelineFunnel(pipelineId: ID!): [PipelineFunnelBucket!]!
    winLossByRep(pipelineId: ID, since: DateTime): [WinLossRow!]!
    customerAcquisitionByMonth(months: Int): [AcquisitionPoint!]!
  }

  extend type Mutation {
    createCustomer(input: JSON!): CrmCustomer!
    updateCustomer(id: ID!, input: JSON!): CrmCustomer!
    deleteCustomer(id: ID!): Boolean!
    bulkAssignCustomers(input: JSON!): Int!
    bulkTagCustomers(input: JSON!): Int!
    mergeCustomers(input: JSON!): CrmCustomer!

    createB2BAccount(input: JSON!): B2BAccount!
    updateB2BAccount(id: ID!, input: JSON!): B2BAccount!
    archiveB2BAccount(id: ID!): Boolean!

    createPipeline(input: JSON!): Pipeline!
    updatePipeline(id: ID!, input: JSON!): Pipeline!
    archivePipeline(id: ID!): Pipeline!
    createPipelineStage(pipelineId: ID!, input: JSON!): PipelineStage!
    updatePipelineStage(stageId: ID!, input: JSON!): PipelineStage!
    reorderPipelineStages(pipelineId: ID!, stageIds: [ID!]!): [PipelineStage!]!

    createDeal(input: JSON!): Deal!
    updateDeal(id: ID!, input: JSON!): Deal!
    moveDealStage(id: ID!, input: JSON!): Deal!
    attachOrderToDeal(dealId: ID!, orderId: ID!): Boolean!
    detachOrderFromDeal(dealId: ID!, orderId: ID!): Boolean!
    attachQuoteToDeal(dealId: ID!, quoteId: ID!): Boolean!
    detachQuoteFromDeal(dealId: ID!, quoteId: ID!): Boolean!

    recordCrmActivity(input: JSON!): CrmActivity!

    createCrmTask(input: JSON!): CrmTask!
    updateCrmTask(id: ID!, input: JSON!): CrmTask!
    completeCrmTask(id: ID!): CrmTask!

    createSegment(input: JSON!): Segment!
    updateSegment(id: ID!, input: JSON!): Segment!
    archiveSegment(id: ID!): Boolean!
    recomputeSegment(id: ID!): JSON!
  }
`;
