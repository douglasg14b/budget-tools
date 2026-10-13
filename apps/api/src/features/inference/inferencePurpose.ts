/**
 * What an OpenRouter call was for. Every call declares one, so spend can be grouped by job.
 * One value per distinct prompt: retries of the same prompt share it.
 */
export type InferencePurpose =
    /** Category (and payee) suggestion for one transaction in the review queue. */
    | 'transaction-category'
    /** Category per Amazon line item for a split transaction. */
    | 'amazon-split'
    /** Receipt vision: vendor, date, grand total, and the handwriting/reimbursable flags. */
    | 'receipt-header'
    /** Receipt vision: line items, tax, discount, and tip. */
    | 'receipt-lines'
    /** Receipt vision: the handwritten "reimbursable" note and its amount. */
    | 'receipt-reimbursable-note'
    /** Handwritten-totals settle: transcribe the totals block. */
    | 'receipt-totals-block'
    /** Handwritten-totals settle: read one row (tip or total) in isolation. */
    | 'receipt-row-read'
    /** Handwritten-totals settle: multiple-choice check of the handwritten total. */
    | 'receipt-total-choice'
    /** Decisions API: flag lines that look misread after extraction. */
    | 'receipt-verify'
    /** Decisions API (Jev): confirm a receipt and a transaction are the same purchase. */
    | 'receipt-bind-confirm';
