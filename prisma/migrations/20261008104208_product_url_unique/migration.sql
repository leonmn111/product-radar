-- CreateIndex
CREATE UNIQUE INDEX "Product_url_key" ON "Product"("url");


-- Live products are keyed by their page URL, so it must be a real web address.
ALTER TABLE "Product" ADD CONSTRAINT "Product_url_http_chk"
  CHECK ("url" IS NULL OR "url" ~* '^https?://[^\s]+$');
