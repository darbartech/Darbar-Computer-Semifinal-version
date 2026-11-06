# 05 — Fees & Payments

Needs: migration sets A (Counter), B (students), roles ACCOUNTANT/RECEPTION. Currency is whole **NPR** stored as `Int` (matches `Course.feeNPR`). If you ever need paisa, multiply by 100 everywhere — decide now.

Principles: **append-only ledger** (never edit or delete a payment; void it), every number from `Counter`, every action audited, balances are **computed**, not typed.

---

## 1. Schema (migration set C)
```prisma
enum InvoiceStatus   { DRAFT ISSUED PARTIAL PAID VOID }
enum PaymentMethod   { CASH BANK_TRANSFER CHEQUE ESEWA KHALTI FONEPAY CONNECTIPS OTHER }
enum PaymentStatus   { RECEIVED VOIDED }
enum PaymentProvider { ESEWA KHALTI }
enum IntentStatus    { INITIATED PENDING COMPLETED FAILED EXPIRED }

model Invoice {
  id             String        @id @default(cuid())
  number         String        @unique              // INV-2026-00001 (Counter "invoice:2026")
  studentId      String
  student        StudentProfile @relation(fields: [studentId], references: [id], onDelete: Restrict)
  enrollmentId   String?
  enrollment     Enrollment?   @relation(fields: [enrollmentId], references: [id], onDelete: SetNull)
  title          String                              // "Web Development — Batch Magh 2083"
  grossAmount    Int                                 // course fee at invoice time
  discountAmount Int           @default(0)
  discountReason String?
  netAmount      Int                                 // gross - discount  (stored, immutable after ISSUED)
  status         InvoiceStatus @default(DRAFT)
  dueDate        DateTime?     @db.Date
  note           String?
  voidReason     String?
  createdById    String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  installments InvoiceInstallment[]
  payments     Payment[]
  @@index([studentId, status])
  @@index([dueDate, status])
}

model InvoiceInstallment {
  id        String   @id @default(cuid())
  invoiceId String
  invoice   Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  seq       Int
  amount    Int
  dueDate   DateTime @db.Date
  @@unique([invoiceId, seq])
  @@index([dueDate])
}

model Payment {
  id           String        @id @default(cuid())
  receiptNo    String        @unique              // RCPT-2026-00001 (Counter "receipt:2026")
  invoiceId    String
  invoice      Invoice       @relation(fields: [invoiceId], references: [id], onDelete: Restrict)
  amount       Int
  method       PaymentMethod
  reference    String?                            // bank slip no., cheque no., gateway ref
  status       PaymentStatus @default(RECEIVED)
  receivedAt   DateTime      @default(now())
  receivedById String?
  voidedAt     DateTime?
  voidedById   String?
  voidReason   String?
  intentId     String?       @unique
  intent       PaymentIntent? @relation(fields: [intentId], references: [id])
  createdAt    DateTime      @default(now())
  @@index([invoiceId])
  @@index([receivedAt])
}

model PaymentIntent {
  id          String          @id @default(cuid())
  invoiceId   String
  provider    PaymentProvider
  amount      Int
  txnUuid     String          @unique            // our id sent to the gateway
  providerRef String?                            // pidx / refId
  status      IntentStatus    @default(INITIATED)
  rawResponse Json?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  payment     Payment?
  @@index([invoiceId])
}
```
SQL guards (append to migration):
```sql
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_check" CHECK ("grossAmount" >= 0 AND "discountAmount" >= 0 AND "discountAmount" <= "grossAmount" AND "netAmount" = "grossAmount" - "discountAmount");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" > 0);
```
Add back-relations: `StudentProfile.invoices`, `Enrollment.invoices`.

## 2. Domain rules (put in `server/services/fees.ts`)
- `balance(invoice) = netAmount − Σ payments(status=RECEIVED).amount`.
- After every payment/void: recompute status in the **same transaction**: `PAID` if balance = 0; `PARTIAL` if 0 < paid < net; `ISSUED` if paid = 0. A `VOID` invoice accepts no payments.
- **Overpayment is rejected** (`amount ≤ balance`), unless an explicit "advance" feature is added later.
- Installments are **a schedule only** (for the dues list); payments are applied to the invoice, and the "next due" = earliest installment whose cumulative amount > paid.
- Discounts above a threshold (Settings, e.g. 10 %) need ADMIN approval: create with `DRAFT`, ADMIN issues.
- Editing an issued invoice is forbidden: **void + recreate** (reason required).
- Voiding a payment needs `payment.void` + reason; receipt stays in the list as VOIDED.

## 3. Payment recording (cash / bank) — transaction
```ts
export async function recordPayment(input) {
  const user = await requirePermission("payment.record");
  const p = paymentSchema.parse(input);              // invoiceId, amount, method, reference?, receivedAt?
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: p.invoiceId }, include: { payments: { where: { status: "RECEIVED" } } }});
    if (!inv || inv.status === "VOID" || inv.status === "DRAFT") throw new UserError("Invoice not payable");
    const paid = inv.payments.reduce((s, x) => s + x.amount, 0);
    if (p.amount > inv.netAmount - paid) throw new UserError("Amount is more than the balance");
    const n = await nextSequence(`receipt:${new Date().getFullYear()}`, tx);
    const payment = await tx.payment.create({ data: { receiptNo: `RCPT-${year}-${pad(n)}`, ...p, receivedById: user.id }});
    const newPaid = paid + p.amount;
    await tx.invoice.update({ where: { id: inv.id }, data: { status: newPaid >= inv.netAmount ? "PAID" : "PARTIAL" }});
    return payment;
  }, { isolationLevel: "Serializable" });            // retry once on P2034
}
```
Then: audit (`payment.record`, meta amount/method only), generate receipt PDF, send SMS/e-mail receipt (doc 07).

## 4. Receipt PDF
Reuse the `pdf-lib` + fonts already used for certificates: `server/fees/receipt-pdf.ts` (A5, logo, receipt no., student name + code, course, amount in figures and **words** (Nepali/English), method, balance after payment, received-by, QR to `/verify-receipt/<token>` optional). Download route `/api/techdarbar/payments/[id]/receipt` guarded by `fee.read`; students get `/api/student/payments/[id]/receipt` limited to their own invoices. Do **not** store receipt PDFs publicly (same private-storage rules as certificates) — or render on demand.

## 5. Screens
**Admin**
- `/techdarbar/fees` — tabs: *Dues* (default), *Invoices*, *Payments*. Dues: overdue first, aging chips (0-7, 8-30, 30+ days), "Send reminder" (doc 07), filter by batch/course/counselor.
- Student detail → *Fees* tab: invoices, balance, "Record payment" dialog (amount defaults to next installment, method, reference, date), print receipt.
- `/techdarbar/fees/day-book` — cash book per day: totals by method, who received; "Close day" snapshot for the accountant (optional model `DayClose`).
- Invoice create from admission (doc 04) or from enrollment screen.
**Student portal** — *My fees*: invoice list, balance, next due date, receipts, "Pay online" (if enabled).

## 6. Online payments (eSewa / Khalti) — optional phase
Always **verify server-side** with the gateway before crediting; never trust the browser redirect. Read each provider's current docs when implementing (signature fields and endpoints change); outline:

**eSewa (ePay v2):**
1. `initiatePaymentAction(invoiceId, amount)` → create `PaymentIntent(txnUuid=uuid)`; build form fields (`amount`, `total_amount`, `transaction_uuid`, `product_code`, `success_url`, `failure_url`, `signed_field_names`, `signature`), where `signature = base64(HMAC_SHA256(secret, "total_amount=..,transaction_uuid=..,product_code=.."))`.
2. Auto-submit the form to eSewa; on return to `success_url` (route `/api/payments/esewa/return`), decode `data`, **verify signature**, then call eSewa's *transaction status* API with `product_code`, `total_amount`, `transaction_uuid`; only `COMPLETE` credits the invoice.
**Khalti (ePayment):**
1. Server calls initiate (`return_url`, `website_url`, `amount` in **paisa**, `purchase_order_id=txnUuid`) with the secret key; redirect the student to the returned `payment_url`.
2. On return, call **lookup** with `pidx`; credit only when status is `Completed` and the amount equals the intent.
Common rules: idempotent crediting (`PaymentIntent.status` transition `PENDING→COMPLETED` via `updateMany` + unique `Payment.intentId`), amount must match the intent and ≤ balance, rate-limit the initiate action, a nightly job expires old intents and re-checks `PENDING` ones, keep secrets only in env (`ESEWA_SECRET`, `KHALTI_SECRET_KEY`), use sandbox first, never log full responses with personal data.
Fonepay/ConnectIPS usually need a merchant agreement — start the paperwork early.

## 7. Settings (SiteSetting keys)
`fees.currency="NPR"`, `fees.discountApprovalThresholdPct`, `fees.lateFeePerWeek` (optional), `fees.certificateRequiresClearance` (bool + `allowedDueAmount`), `fees.receiptFooter`, `fees.bankDetails` (shown on invoices).

## 8. Reports (see doc 07)
Collections by day/month/method, outstanding dues with aging, discount totals by staff, collection per course/batch, refund/void list.

## 9. Tests (must-have)
1. Two simultaneous payments for the same invoice never exceed the balance (Serializable + retry).
2. Receipt numbers are unique and gap-explainable under concurrency.
3. Void restores balance and invoice status; voided payment cannot be voided twice.
4. RECEPTION can record but not void; COUNSELOR has no fee access.
5. Gateway callback replay does not double-credit.
