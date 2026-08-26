/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { TravelWindowsController } from './../features/travelWindows/travelWindowsController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { TravelBiasController } from './../features/travelWindows/travelBiasController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AccountsController } from './../features/travelWindows/accountsController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { HealthController } from './../features/health/healthController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CategorizationController } from './../features/categorization/categorizationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CategoriesController } from './../features/categories/categoriesController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AmazonOrdersController } from './../features/amazonOrders/amazonOrdersController';
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';



// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "TravelWindowKindDto": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["vacation"]},{"dataType":"enum","enums":["work"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TravelWindowAccountDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TravelWindowDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"accounts":{"dataType":"array","array":{"dataType":"refAlias","ref":"TravelWindowAccountDto"},"required":true},"location":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"endDate":{"dataType":"string","required":true},"startDate":{"dataType":"string","required":true},"kind":{"ref":"TravelWindowKindDto","required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TravelWindowsDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"windows":{"dataType":"array","array":{"dataType":"refAlias","ref":"TravelWindowDto"},"required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TravelWindowWriteDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"accounts":{"dataType":"array","array":{"dataType":"refAlias","ref":"TravelWindowAccountDto"},"required":true},"location":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"endDate":{"dataType":"string","required":true},"startDate":{"dataType":"string","required":true},"kind":{"ref":"TravelWindowKindDto","required":true},"name":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TravelBiasDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"enabled":{"dataType":"boolean","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AccountDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AccountsDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"accounts":{"dataType":"array","array":{"dataType":"refAlias","ref":"AccountDto"},"required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HealthDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"ok":{"dataType":"enum","enums":[true],"required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "QueueSummaryDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"blocked":{"dataType":"double","required":true},"review":{"dataType":"double","required":true},"suggested":{"dataType":"double","required":true},"autoApply":{"dataType":"double","required":true},"total":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TransactionClearedStatus": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["uncleared"]},{"dataType":"enum","enums":["cleared"]},{"dataType":"enum","enums":["reconciled"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TransactionDetailDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"importPayeeNameOriginal":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"importPayeeName":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"importId":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"categoryName":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"categoryId":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"payeeName":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"payeeId":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"accountName":{"dataType":"string","required":true},"accountId":{"dataType":"string","required":true},"approved":{"dataType":"boolean","required":true},"cleared":{"ref":"TransactionClearedStatus","required":true},"memo":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"amount":{"dataType":"double","required":true},"date":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApprovalTier": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["AutoApply"]},{"dataType":"enum","enums":["Suggested"]},{"dataType":"enum","enums":["Review"]},{"dataType":"enum","enums":["Blocked"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategorizationFlagsDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"isTravelWindow":{"dataType":"boolean","required":true},"isPeriodicConflict":{"dataType":"boolean","required":true},"isPeriodic":{"dataType":"boolean","required":true},"requiresManualReview":{"dataType":"boolean","required":true},"isExcluded":{"dataType":"boolean","required":true},"isNovelImport":{"dataType":"boolean","required":true},"isAmbiguous":{"dataType":"boolean","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategorizationMethod": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ImportAmountLookup"]},{"dataType":"enum","enums":["ImportLookup"]},{"dataType":"enum","enums":["PayeeIdLookup"]},{"dataType":"enum","enums":["CanonicalPayeeLookup"]},{"dataType":"enum","enums":["PayeeClusterLookup"]},{"dataType":"enum","enums":["PayeeModel"]},{"dataType":"enum","enums":["HierarchicalModel"]},{"dataType":"enum","enums":["CategoryModel"]},{"dataType":"enum","enums":["PeriodicSeriesLookup"]},{"dataType":"enum","enums":["Consensus"]},{"dataType":"enum","enums":["LlmCategorization"]},{"dataType":"enum","enums":["TravelWindow"]},{"dataType":"enum","enums":["Excluded"]},{"dataType":"enum","enums":["ManualReview"]},{"dataType":"enum","enums":["None"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategorizationRouteReason": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["None"]},{"dataType":"enum","enums":["ExcludedPayee"]},{"dataType":"enum","enums":["ExcludedCheck"]},{"dataType":"enum","enums":["AmbiguousMerchant"]},{"dataType":"enum","enums":["UntrainedCategory"]},{"dataType":"enum","enums":["NovelImportString"]},{"dataType":"enum","enums":["LowConfidence"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProposalGapReason": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["None"]},{"dataType":"enum","enums":["AmbiguousMerchant"]},{"dataType":"enum","enums":["InsufficientAgreement"]},{"dataType":"enum","enums":["TwoMethodSuggestion"]},{"dataType":"enum","enums":["SingleMethodSuggestion"]},{"dataType":"enum","enums":["ImportAmountNearMiss"]},{"dataType":"enum","enums":["NoQualifiedSignals"]},{"dataType":"enum","enums":["LlmSuggestion"]},{"dataType":"enum","enums":["Excluded"]},{"dataType":"enum","enums":["PeriodicConflict"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MethodSignalDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"confidence":{"dataType":"double","required":true},"category":{"dataType":"string","required":true},"method":{"ref":"CategorizationMethod","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategoryOptionDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"supportingMethods":{"dataType":"array","array":{"dataType":"refAlias","ref":"MethodSignalDto"},"required":true},"confidence":{"dataType":"double","required":true},"categoryId":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"categoryGroup":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"category":{"dataType":"string","required":true},"rank":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ConfidenceIntervalDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"spread":{"dataType":"double","required":true},"third":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},"second":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},"top":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PayeeResolutionMethod": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ExactLookup"]},{"dataType":"enum","enums":["ClusterLookup"]},{"dataType":"enum","enums":["Model"]},{"dataType":"enum","enums":["Llm"]},{"dataType":"enum","enums":["Unresolved"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PayeeSuggestionDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"needsRename":{"dataType":"boolean","required":true},"confidence":{"dataType":"double","required":true},"method":{"ref":"PayeeResolutionMethod","required":true},"name":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PeriodicCadence": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["Weekly"]},{"dataType":"enum","enums":["Biweekly"]},{"dataType":"enum","enums":["Monthly"]},{"dataType":"enum","enums":["Quarterly"]},{"dataType":"enum","enums":["Yearly"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PeriodicMatchDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"cadenceFit":{"dataType":"double","required":true},"relatedTransactionIds":{"dataType":"array","array":{"dataType":"string"},"required":true},"categoryVoteShare":{"dataType":"double","required":true},"category":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"lastDate":{"dataType":"string","required":true},"medianAmount":{"dataType":"double","required":true},"occurrenceCount":{"dataType":"double","required":true},"cadence":{"ref":"PeriodicCadence","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TravelLocationMatch": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["match"]},{"dataType":"enum","enums":["mismatch"]},{"dataType":"enum","enums":["unknown"]},{"dataType":"enum","enums":["unspecified"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TravelWindowHitDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"merchantCity":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"locationMatch":{"ref":"TravelLocationMatch","required":true},"location":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"targetCategory":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"kind":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["vacation"]},{"dataType":"enum","enums":["work"]}],"required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategorizationProposalDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"travelWindow":{"dataType":"union","subSchemas":[{"ref":"TravelWindowHitDto"},{"dataType":"enum","enums":[null]}],"required":true},"periodicMatch":{"dataType":"union","subSchemas":[{"ref":"PeriodicMatchDto"},{"dataType":"enum","enums":[null]}],"required":true},"notes":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"payeeSuggestion":{"dataType":"union","subSchemas":[{"ref":"PayeeSuggestionDto"},{"dataType":"enum","enums":[null]}],"required":true},"resolvedPayee":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"featureText":{"dataType":"string","required":true},"confidenceInterval":{"ref":"ConfidenceIntervalDto","required":true},"options":{"dataType":"array","array":{"dataType":"refAlias","ref":"CategoryOptionDto"},"required":true},"agreeingSignals":{"dataType":"array","array":{"dataType":"refAlias","ref":"MethodSignalDto"},"required":true},"signals":{"dataType":"array","array":{"dataType":"refAlias","ref":"MethodSignalDto"},"required":true},"gapReason":{"ref":"ProposalGapReason","required":true},"routeReason":{"ref":"CategorizationRouteReason","required":true},"method":{"ref":"CategorizationMethod","required":true},"confidence":{"dataType":"double","required":true},"suggestedCategoryId":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"suggestedCategoryGroup":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"suggestedCategory":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"flags":{"ref":"CategorizationFlagsDto","required":true},"tier":{"ref":"ApprovalTier","required":true},"transactionId":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategorizationQueueItemDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"relatedTransactions":{"dataType":"array","array":{"dataType":"refAlias","ref":"TransactionDetailDto"},"required":true},"proposal":{"dataType":"union","subSchemas":[{"ref":"CategorizationProposalDto"},{"dataType":"enum","enums":[null]}],"required":true},"transaction":{"ref":"TransactionDetailDto","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategorizationQueueDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"items":{"dataType":"array","array":{"dataType":"refAlias","ref":"CategorizationQueueItemDto"},"required":true},"hasMoreOlder":{"dataType":"boolean","required":true},"hasMoreNewer":{"dataType":"boolean","required":true},"hasMore":{"dataType":"boolean","required":true},"scoredCount":{"dataType":"double","required":true},"pendingCount":{"dataType":"double","required":true},"llm":{"dataType":"boolean","required":true},"generatedAt":{"dataType":"string","required":true},"summary":{"ref":"QueueSummaryDto","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LlmSuggestOverlayDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"options":{"dataType":"array","array":{"dataType":"refAlias","ref":"CategoryOptionDto"},"required":true},"payeeSuggestion":{"dataType":"union","subSchemas":[{"ref":"PayeeSuggestionDto"},{"dataType":"enum","enums":[null]}],"required":true},"notes":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"confidence":{"dataType":"double","required":true},"suggestedCategoryId":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"suggestedCategoryGroup":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"suggestedCategory":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"model":{"dataType":"string","required":true},"transactionId":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LlmSuggestRequestDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"transactionId":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonMatchKindDto": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["payment"]},{"dataType":"enum","enums":["batched-orders"]},{"dataType":"enum","enums":["partial-order"]},{"dataType":"enum","enums":["unmatched"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonMatchedPaymentDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"isRefund":{"dataType":"boolean","required":true},"vendor":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"cardLast4":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"currency":{"dataType":"string","required":true},"amount":{"dataType":"double","required":true},"paymentDate":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonMatchedOrderDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"promotion":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},"shipping":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},"tax":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},"total":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},"orderDate":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"orderId":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonSplitItemDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"categoryGroup":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"categoryName":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"categoryId":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"amount":{"dataType":"double","required":true},"quantity":{"dataType":"double","required":true},"asin":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"title":{"dataType":"string","required":true},"orderId":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonSplitLineDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"memo":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"categoryGroup":{"dataType":"string","required":true},"categoryName":{"dataType":"string","required":true},"categoryId":{"dataType":"string","required":true},"amount":{"dataType":"double","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonSplitOverlayDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"notes":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"rationale":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"collapsed":{"dataType":"boolean","required":true},"lines":{"dataType":"array","array":{"dataType":"refAlias","ref":"AmazonSplitLineDto"},"required":true},"items":{"dataType":"array","array":{"dataType":"refAlias","ref":"AmazonSplitItemDto"},"required":true},"orderIds":{"dataType":"array","array":{"dataType":"string"},"required":true},"orders":{"dataType":"array","array":{"dataType":"refAlias","ref":"AmazonMatchedOrderDto"},"required":true},"payment":{"dataType":"union","subSchemas":[{"ref":"AmazonMatchedPaymentDto"},{"dataType":"enum","enums":[null]}],"required":true},"match":{"ref":"AmazonMatchKindDto","required":true},"dataStatus":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ready"]},{"dataType":"enum","enums":["not-synced"]}],"required":true},"transactionId":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonSuggestRequestDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"transactionId":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategorizationPredictDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"items":{"dataType":"array","array":{"dataType":"refAlias","ref":"CategorizationQueueItemDto"},"required":true},"generatedAt":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategorizationPredictRequestDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"transactionIds":{"dataType":"array","array":{"dataType":"string"},"required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategoryDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"note":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"hidden":{"dataType":"boolean","required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategoryGroupDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"categories":{"dataType":"array","array":{"dataType":"refAlias","ref":"CategoryDto"},"required":true},"hidden":{"dataType":"boolean","required":true},"name":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategoriesDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"groups":{"dataType":"array","array":{"dataType":"refAlias","ref":"CategoryGroupDto"},"required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonOrdersDateRangeDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"end":{"dataType":"string","required":true},"start":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonOrdersStatusDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"items":{"dataType":"double","required":true},"orders":{"dataType":"double","required":true},"payments":{"dataType":"double","required":true},"coveredRanges":{"dataType":"array","array":{"dataType":"refAlias","ref":"AmazonOrdersDateRangeDto"},"required":true},"lastAuthenticated":{"dataType":"boolean","required":true},"lastAuthCheck":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"mcpConfigured":{"dataType":"boolean","required":true},"region":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonOrdersSyncDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"coveredRanges":{"dataType":"array","array":{"dataType":"refAlias","ref":"AmazonOrdersDateRangeDto"},"required":true},"items":{"dataType":"double","required":true},"orders":{"dataType":"double","required":true},"payments":{"dataType":"double","required":true},"fetchedOrderIds":{"dataType":"array","array":{"dataType":"string"},"required":true},"scrapedPaymentGaps":{"dataType":"array","array":{"dataType":"refAlias","ref":"AmazonOrdersDateRangeDto"},"required":true},"to":{"dataType":"string","required":true},"from":{"dataType":"string","required":true},"region":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AmazonOrdersSyncRequestDto": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{"region":{"dataType":"string"},"to":{"dataType":"string","required":true},"from":{"dataType":"string","required":true}},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new ExpressTemplateService(models, {"noImplicitAdditionalProperties":"throw-on-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa




export function RegisterRoutes(app: Router) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################


    
        const argsTravelWindowsController_listTravelWindows: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/travel-windows',
            ...(fetchMiddlewares<RequestHandler>(TravelWindowsController)),
            ...(fetchMiddlewares<RequestHandler>(TravelWindowsController.prototype.listTravelWindows)),

            async function TravelWindowsController_listTravelWindows(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTravelWindowsController_listTravelWindows, request, response });

                const controller = new TravelWindowsController();

              await templateService.apiHandler({
                methodName: 'listTravelWindows',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTravelWindowsController_createTravelWindow: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"TravelWindowWriteDto"},
        };
        app.post('/api/travel-windows',
            ...(fetchMiddlewares<RequestHandler>(TravelWindowsController)),
            ...(fetchMiddlewares<RequestHandler>(TravelWindowsController.prototype.createTravelWindow)),

            async function TravelWindowsController_createTravelWindow(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTravelWindowsController_createTravelWindow, request, response });

                const controller = new TravelWindowsController();

              await templateService.apiHandler({
                methodName: 'createTravelWindow',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTravelWindowsController_updateTravelWindow: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"TravelWindowWriteDto"},
        };
        app.put('/api/travel-windows/:id',
            ...(fetchMiddlewares<RequestHandler>(TravelWindowsController)),
            ...(fetchMiddlewares<RequestHandler>(TravelWindowsController.prototype.updateTravelWindow)),

            async function TravelWindowsController_updateTravelWindow(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTravelWindowsController_updateTravelWindow, request, response });

                const controller = new TravelWindowsController();

              await templateService.apiHandler({
                methodName: 'updateTravelWindow',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTravelWindowsController_deleteTravelWindow: Record<string, TsoaRoute.ParameterSchema> = {
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.delete('/api/travel-windows/:id',
            ...(fetchMiddlewares<RequestHandler>(TravelWindowsController)),
            ...(fetchMiddlewares<RequestHandler>(TravelWindowsController.prototype.deleteTravelWindow)),

            async function TravelWindowsController_deleteTravelWindow(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTravelWindowsController_deleteTravelWindow, request, response });

                const controller = new TravelWindowsController();

              await templateService.apiHandler({
                methodName: 'deleteTravelWindow',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTravelBiasController_getTravelBias: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/travel-bias',
            ...(fetchMiddlewares<RequestHandler>(TravelBiasController)),
            ...(fetchMiddlewares<RequestHandler>(TravelBiasController.prototype.getTravelBias)),

            async function TravelBiasController_getTravelBias(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTravelBiasController_getTravelBias, request, response });

                const controller = new TravelBiasController();

              await templateService.apiHandler({
                methodName: 'getTravelBias',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsTravelBiasController_patchTravelBias: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"TravelBiasDto"},
        };
        app.patch('/api/travel-bias',
            ...(fetchMiddlewares<RequestHandler>(TravelBiasController)),
            ...(fetchMiddlewares<RequestHandler>(TravelBiasController.prototype.patchTravelBias)),

            async function TravelBiasController_patchTravelBias(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsTravelBiasController_patchTravelBias, request, response });

                const controller = new TravelBiasController();

              await templateService.apiHandler({
                methodName: 'patchTravelBias',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccountsController_listAccounts: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/accounts',
            ...(fetchMiddlewares<RequestHandler>(AccountsController)),
            ...(fetchMiddlewares<RequestHandler>(AccountsController.prototype.listAccounts)),

            async function AccountsController_listAccounts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccountsController_listAccounts, request, response });

                const controller = new AccountsController();

              await templateService.apiHandler({
                methodName: 'listAccounts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsHealthController_getHealth: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/health',
            ...(fetchMiddlewares<RequestHandler>(HealthController)),
            ...(fetchMiddlewares<RequestHandler>(HealthController.prototype.getHealth)),

            async function HealthController_getHealth(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsHealthController_getHealth, request, response });

                const controller = new HealthController();

              await templateService.apiHandler({
                methodName: 'getHealth',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCategorizationController_getCategorizationQueue: Record<string, TsoaRoute.ParameterSchema> = {
                tier: {"in":"query","name":"tier","dataType":"string"},
                accountId: {"in":"query","name":"accountId","dataType":"string"},
                q: {"in":"query","name":"q","dataType":"string"},
                refresh: {"in":"query","name":"refresh","dataType":"boolean"},
                expand: {"in":"query","name":"expand","dataType":"boolean"},
                around: {"in":"query","name":"around","dataType":"string"},
                olderThan: {"in":"query","name":"olderThan","dataType":"string"},
                newerThan: {"in":"query","name":"newerThan","dataType":"string"},
        };
        app.get('/api/categorization/queue',
            ...(fetchMiddlewares<RequestHandler>(CategorizationController)),
            ...(fetchMiddlewares<RequestHandler>(CategorizationController.prototype.getCategorizationQueue)),

            async function CategorizationController_getCategorizationQueue(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCategorizationController_getCategorizationQueue, request, response });

                const controller = new CategorizationController();

              await templateService.apiHandler({
                methodName: 'getCategorizationQueue',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCategorizationController_postLlmSuggest: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"LlmSuggestRequestDto"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/categorization/llm-suggest',
            ...(fetchMiddlewares<RequestHandler>(CategorizationController)),
            ...(fetchMiddlewares<RequestHandler>(CategorizationController.prototype.postLlmSuggest)),

            async function CategorizationController_postLlmSuggest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCategorizationController_postLlmSuggest, request, response });

                const controller = new CategorizationController();

              await templateService.apiHandler({
                methodName: 'postLlmSuggest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCategorizationController_postAmazonSuggest: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"AmazonSuggestRequestDto"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/categorization/amazon-suggest',
            ...(fetchMiddlewares<RequestHandler>(CategorizationController)),
            ...(fetchMiddlewares<RequestHandler>(CategorizationController.prototype.postAmazonSuggest)),

            async function CategorizationController_postAmazonSuggest(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCategorizationController_postAmazonSuggest, request, response });

                const controller = new CategorizationController();

              await templateService.apiHandler({
                methodName: 'postAmazonSuggest',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCategorizationController_postPredict: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CategorizationPredictRequestDto"},
        };
        app.post('/api/categorization/predict',
            ...(fetchMiddlewares<RequestHandler>(CategorizationController)),
            ...(fetchMiddlewares<RequestHandler>(CategorizationController.prototype.postPredict)),

            async function CategorizationController_postPredict(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCategorizationController_postPredict, request, response });

                const controller = new CategorizationController();

              await templateService.apiHandler({
                methodName: 'postPredict',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCategoriesController_getCategories: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/categories',
            ...(fetchMiddlewares<RequestHandler>(CategoriesController)),
            ...(fetchMiddlewares<RequestHandler>(CategoriesController.prototype.getCategories)),

            async function CategoriesController_getCategories(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCategoriesController_getCategories, request, response });

                const controller = new CategoriesController();

              await templateService.apiHandler({
                methodName: 'getCategories',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAmazonOrdersController_getAmazonOrdersStatus: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/amazon-orders/status',
            ...(fetchMiddlewares<RequestHandler>(AmazonOrdersController)),
            ...(fetchMiddlewares<RequestHandler>(AmazonOrdersController.prototype.getAmazonOrdersStatus)),

            async function AmazonOrdersController_getAmazonOrdersStatus(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAmazonOrdersController_getAmazonOrdersStatus, request, response });

                const controller = new AmazonOrdersController();

              await templateService.apiHandler({
                methodName: 'getAmazonOrdersStatus',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAmazonOrdersController_postAmazonOrdersSync: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"AmazonOrdersSyncRequestDto"},
        };
        app.post('/api/amazon-orders/sync',
            ...(fetchMiddlewares<RequestHandler>(AmazonOrdersController)),
            ...(fetchMiddlewares<RequestHandler>(AmazonOrdersController.prototype.postAmazonOrdersSync)),

            async function AmazonOrdersController_postAmazonOrdersSync(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAmazonOrdersController_postAmazonOrdersSync, request, response });

                const controller = new AmazonOrdersController();

              await templateService.apiHandler({
                methodName: 'postAmazonOrdersSync',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
