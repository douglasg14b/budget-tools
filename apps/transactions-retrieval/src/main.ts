import { logSection, logSubSection } from '@budget-tools/logging';

import { categoriesService } from './services/categoriesService';
import { metricsService } from './services/metricsService';
import { ynabTransactionsService } from './services/ynabTransactionsService';

const VERSION = '1.6';

logSection(`Starting Transactions Retrieval v${VERSION}`);

logSubSection('Pulling categories from YNAB');
await categoriesService.processCategories();

logSubSection('Pulling transactions from YNAB');
await ynabTransactionsService.processTransactions();

logSubSection('Generating metrics');
await metricsService.generateMetrics();

logSubSection('DONE');
