-- Payment idempotency (fix guide §1). `recordPayment` already serialises two clerks
-- on one invoice with a row lock, but the second click of a double-clicked dialog is
-- still accepted while it fits the balance, so it prints a second receipt for the
-- same money. The key is one value per opening of the dialog: a replay finds the
-- receipt it already made and reports that instead.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
