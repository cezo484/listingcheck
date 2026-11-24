# Commercial summary

Short answers for the Season II submission form (Apps and Agents,
Mission 01 Exchange).

## 1. Who is the user or buyer?

A listings desk at a spot or derivatives exchange: the analyst who
reviews token listing applications, and the compliance officer who
signs off on them. Smaller venues without a full research team get the
most from it, because they review listings with one or two people.

## 2. How often does the problem occur?

Every listing application. A mid-size venue reviews several tokens a
week, and each review takes days to weeks of analyst time today:
contract review, holder checks, sanctions screening, and social
checks, each done by hand in a different tool. Fake listing
announcements also appear daily, and traders check them just as often.

## 3. What does the buyer pay today, and what would they pay for this?

Today the buyer pays analyst time: days of work per listing, plus
separate subscriptions for sanctions screening and on-chain data.
ListingCheck buys the same evidence per listing for about five cents
of intelligence on testnet pricing, and returns the memo in about a
minute. A venue would pay per memo, or a flat monthly fee for a
number of memos, and keep the human sign-off.

## 4. What is the finished result the buyer gets?

A signed listing risk memo: a verdict (list, review, or do not list),
one section per check with the miner answer verbatim, the payment
transaction, receipt hash, and signal hash for every request, and a
cost line at the bottom. The memo is the evidence pack the reviewer
starts from, and the verification hash lets anyone re-check that the
memo was not changed after it was written.

## 5. What would make a buyer trust it?

Three things. First, every claim in the memo traces to a paid request
with a receipt, so the buyer can re-check each input. Second, the
reader is conservative: an answer it cannot parse is marked
inconclusive, never a pass, so the memo fails toward human review
instead of toward a wrong approval. Third, the memo never claims to
be the decision: a human still signs off, and the tool says so on
every memo.
