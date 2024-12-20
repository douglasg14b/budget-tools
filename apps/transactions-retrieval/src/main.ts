import { logSection, logSubSection } from '@budget-tools/logging';

import { categoriesService } from './services/categoriesService';
import { ynabTransactionsService } from './services/ynabTransactionsService';

const VERSION = '1.4';

logSection(`Starting Transactions Retrieval v${VERSION}`);

logSubSection('Pulling categories from YNAB');
await categoriesService.processCategories();

logSubSection('Pulling transactions from YNAB');
await ynabTransactionsService.processTransactions();

logSubSection('DONE');
