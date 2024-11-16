const EthEnsNamehash = require("eth-ens-namehash");
const ensRegistry = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"; // see https://docs.ens.domains/ens-deployments
const tomiRegistry = "0x4F85c3d1A5B9655FDbFf53f24Da6DB9ABD61b481";
const rpcHost =
  "https://mainnet.infura.io/v3/8ed191d0d74a4e0381922d75c6384379"; /* mainnet */
const ipfsBaseUrl = "https://infura-ipfs.io/ipfs/";

function removePrefix(hex) {
  if (hex.substr(0, 2) === "0x") return hex.substr(2);
  return hex;
}

async function requestPostJson(url, data) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (this.readyState == 4) {
        let response;
        if (this.status == 200) {
          try {
            response = JSON.parse(this.responseText);
          } catch (err) {
            reject(err);
            return;
          }
          const result = response.result;

          if (!result) {
            reject("Geth request failed");
            return;
          }

          if (result.length <= 2) {
            reject("Invalid response");
            return;
          }

          resolve(result);
        } else {
          try {
            response = JSON.parse(this.responseText);
          } catch (err) {
            //
          }
          if (response.error && response.error.message) {
            reject(response.error.message);
            return;
          }
          reject("returned status code " + this.status);
        }
      }
    };
    xhr.onerror = () => reject(xhr.response);
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", "application/json;charset=utf-8");
    xhr.send(JSON.stringify(data));
  });
}

async function lookupResolver(host, nameHash, ensRegistry, tomiRegistry) {
  const dataGetEnsResolver = {
    id: 0,
    jsonrpc: "2.0",
    params: [
      {
        to: ensRegistry,
        data: "0x0178b8bf" + removePrefix(nameHash),
      },
      "latest",
    ],
    method: "eth_call",
  };

  const ensResult = await requestPostJson(host, dataGetEnsResolver);
  const ensCleanResult = removePrefix(ensResult);
  const ensResolver = "0x" + ensCleanResult.substr(24);

  if (ensResolver !== "0x0000000000000000000000000000000000000000") {
    return ensResolver;
  }

  const dataGetTomiResolver = {
    id: 0,
    jsonrpc: "2.0",
    params: [
      {
        to: tomiRegistry,
        data: "0x0178b8bf" + removePrefix(nameHash),
      },
      "latest",
    ],
    method: "eth_call",
  };

  const tomiResult = await requestPostJson(host, dataGetTomiResolver);
  const tomiCleanResult = removePrefix(tomiResult);
  const tomiResolver = "0x" + tomiCleanResult.substr(24);

  if (tomiResolver !== "0x0000000000000000000000000000000000000000") {
    return tomiResolver;
  }
  return;
}

async function lookupContenthash(host, nameHash, resolver) {
  const dataGetContentHash = {
    id: 1,
    jsonrpc: "2.0",
    params: [
      {
        to: resolver,
        data: "0xbc1c58d1" + removePrefix(nameHash),
      },
      "latest",
    ],
    method: "eth_call",
  };

  const result = await requestPostJson(host, dataGetContentHash);
  let contentHash = removePrefix(result).substr(32);
  contentHash = contentHash.substr(32);
  const length = contentHash.substr(0, 64);
  const lengthInt = parseInt(length, 16);

  if (lengthInt === 0) {
    return;
  }

  return contentHash.substr(64).substr(0, lengthInt * 2);
}

function contenthashToCID(contenthash) {
  // first byte should be 'e3' for ipfs, then '01' - add 'f' to sign hex codes cid
  return "f" + contenthash.substr(4);
}

const ensPlugin = {
  checkEns: function (url) {
    try {
      const domainPartsEns = url.split(".");
      const length = domainPartsEns.length;
      if (
        domainPartsEns[length - 1] === "eth" ||
        domainPartsEns[length - 1] === "tomi"
      ) {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  },

  resolveEns: async function (hostnameENS) {
    let url = new URL("http://" + hostnameENS);
    try {
      const nameHash = EthEnsNamehash.hash(hostnameENS);
      const resolver = await lookupResolver(
        rpcHost,
        nameHash,
        ensRegistry,
        tomiRegistry
      );
      if (!resolver) {
        return;
      }

      const contenthash = await lookupContenthash(rpcHost, nameHash, resolver);
      if (!contenthash) {
        return;
      }

      const cid = contenthashToCID(contenthash);
      return ipfsBaseUrl + cid + url.pathname + url.search + url.hash;
    } catch (error) {
      return;
    }
  },
};

module.exports = ensPlugin;
