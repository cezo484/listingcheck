// One-off ops script (testnet only): mint 100 testnet USDC from the
// Telegraph devnode USDC contract, which exposes a public permissionless
// mint(address,uint256). Run once: node scripts/mint-usdc.mjs
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const match = envText.match(/^TELEGRAPH_WALLET_PRIVATE_KEY=(.+)$/m);
if (!match) throw new Error("wallet key missing from .env");
const account = privateKeyToAccount(match[1].trim());

const transport = http("https://ethereum-sepolia-rpc.publicnode.com");
const wallet = createWalletClient({ account, chain: sepolia, transport });
const pub = createPublicClient({ chain: sepolia, transport });

const USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
const hash = await wallet.writeContract({
  address: USDC,
  abi: [
    {
      name: "mint",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [],
    },
  ],
  functionName: "mint",
  args: [account.address, 100_000_000n],
});
console.log("tx:", hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log(
  "status:",
  receipt.status,
  "block:",
  receipt.blockNumber,
  "gasUsed:",
  receipt.gasUsed.toString(),
);
