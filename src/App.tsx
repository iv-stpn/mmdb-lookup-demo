import { BR, CA, CN, DE, FR, GB, JP, US } from "country-flag-icons/react/3x2";
import {
  AlertCircle,
  CheckCircle,
  Database,
  Download,
  ExternalLink,
  Globe,
  LoaderCircle,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  createMMDBContext,
  findCIDRBlock,
  getIPRangeDescription,
  loadDataset,
  lookupIP,
  type MMDBContext,
} from "./mmdb";
import type { LookupResult, MMDBDataset, MMDBRecord } from "./types";

// Utility functions for formatting
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
};

const formatSpeed = (bytesPerSecond: number): string => {
  return `${formatFileSize(bytesPerSecond)}/s`;
};

const formatTime = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
};

const AVAILABLE_DATASETS: MMDBDataset[] = [
  {
    name: "GeoLite2-ASN",
    type: "asn",
    url: `${import.meta.env.BASE_URL}mmdb/GeoLite2-ASN.mmdb`,
  },
  {
    name: "GeoLite2-City",
    type: "city",
    url: `${import.meta.env.BASE_URL}mmdb/GeoLite2-City.mmdb`,
  },
  {
    name: "GeoLite2-Country",
    type: "country",
    url: `${import.meta.env.BASE_URL}mmdb/GeoLite2-Country.mmdb`,
  },
];

const SAMPLE_IPV4 = [
  { ip: "8.8.8.8", flag: US },
  { ip: "1.1.1.1", flag: US },
  { ip: "185.199.108.153", flag: US },
  { ip: "194.153.205.26", flag: GB },
  { ip: "217.160.0.201", flag: DE },
  { ip: "212.188.10.77", flag: FR },
  { ip: "159.203.1.2", flag: CA },
  { ip: "177.192.255.38", flag: BR },
  { ip: "202.12.27.33", flag: JP },
  { ip: "203.208.60.1", flag: CN },
];

const SAMPLE_IPV6 = [
  { ip: "2001:4860:4860::8888", flag: US },
  { ip: "2a00:1450:4001:c02::93", flag: GB },
  { ip: "2001:67c:2e8:22::c100:68b", flag: DE },
  { ip: "2001:41d0:8:e8ad::1", flag: FR },
  { ip: "2607:f8b0:4004:c1b::65", flag: CA },
  { ip: "2001:12ff:0:2::451", flag: BR },
  { ip: "2400:da00::6666", flag: CN },
];

interface LoadingState {
  isLoading: boolean;
  progress: number;
  phase: string;
  loaded?: number;
  total?: number;
  speed?: number;
}

function App() {
  const [selectedDataset, setSelectedDataset] = useState<MMDBDataset | null>(
    null
  );
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    progress: 0,
    phase: "",
  });
  const [mmdbContext, setMMDBContext] = useState<MMDBContext>(() =>
    createMMDBContext()
  );
  const [isDatasetLoaded, setIsDatasetLoaded] = useState(false);
  const [ipInput, setIpInput] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupResult[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [userIP, setUserIP] = useState<string | null>(null);

  // Fetch user's IP address on component mount
  useEffect(() => {
    const fetchUserIP = async () => {
      try {
        const response = await fetch("https://api.ipify.org?format=json");
        const data = await response.json();
        setUserIP(data.ip);
      } catch (error) {
        console.error("Failed to fetch user IP:", error);
        // Don't set userIP if the request fails
      }
    };

    fetchUserIP();
  }, []);

  const handleDatasetSelect = async (dataset: MMDBDataset) => {
    if (selectedDataset?.name === dataset.name && isDatasetLoaded) {
      return; // Already loaded
    }

    setSelectedDataset(dataset);
    setIsDatasetLoaded(false);
    setLookupResults([]);

    try {
      setLoadingState({
        isLoading: true,
        progress: 0,
        phase: "Preparing to download...",
        loaded: 0,
        total: 0,
      });

      const newContext = await loadDataset(
        mmdbContext,
        dataset,
        (progressInfo) => {
          setLoadingState({
            isLoading: true,
            progress: Math.min(100, progressInfo.percentage), // Cap at 100%
            phase: progressInfo.phase,
            loaded: progressInfo.loaded,
            total: progressInfo.total,
            speed: progressInfo.speed,
          });
        }
      );

      setMMDBContext(newContext);

      setLoadingState({
        isLoading: false,
        progress: 100,
        phase: "Dataset loaded successfully",
        loaded: 0,
        total: 0,
      });
      setIsDatasetLoaded(true);
    } catch (error) {
      console.error("Error loading dataset:", error);
      setLoadingState({
        isLoading: false,
        progress: 0,
        phase: "Error loading dataset",
        loaded: 0,
        total: 0,
      });
      setIsDatasetLoaded(false);
    }
  };

  const handleLookup = async (ip: string) => {
    if (!selectedDataset || !isDatasetLoaded || !ip.trim()) {
      return;
    }

    setIsLookingUp(true);
    try {
      const data = await lookupIP(mmdbContext, ip.trim());
      const cidrBlock = await findCIDRBlock(mmdbContext, ip.trim());

      const result: LookupResult = {
        ip: ip.trim(),
        dataset: selectedDataset.name,
        data,
        cidrBlock: cidrBlock || undefined,
      };

      setLookupResults((prev) => [result, ...prev.slice(0, 9)]); // Keep last 10 results
    } catch (error) {
      const result: LookupResult = {
        ip: ip.trim(),
        dataset: selectedDataset.name,
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      setLookupResults((prev) => [result, ...prev.slice(0, 9)]);
    } finally {
      setIsLookingUp(false);
    }
  };

  const formatLookupData = (ip: string, data: MMDBRecord) => {
    if (!data) return "No data found";
    if (ip === "1.1.1.1") return "Global (Cloudflare DNS)";

    if ("autonomous_system_number" in data)
      return `AS${data.autonomous_system_number || "?????"} - ${data.autonomous_system_organization || "Unknown"}`;

    if ("city" in data || "location" in data) {
      const parts = [];
      if (data.city?.names?.en) parts.push(data.city.names.en);
      if (data.country?.names?.en) parts.push(data.country.names.en);
      let result = parts.join(", ");
      if (data.location?.latitude && data.location?.longitude) {
        const coordinates = `(${data.location.latitude.toFixed(2)}, ${data.location.longitude.toFixed(2)})`;
        result = result ? `${result} ${coordinates}` : coordinates;
      }

      if (parts.length === 1) return `${result} [City not specified]`;
      return result || "Unknown Location";
    }

    if ("country" in data) {
      const countryParts = [];
      if (data.country?.names?.en) countryParts.push(data.country.names.en);
      if (data.continent?.names?.en)
        countryParts.push(`(${data.continent.names.en})`);
      return countryParts.join(" ") || "Unknown Country";
    }

    return "Unknown";
  };

  const handleDownloadDataset = (dataset: MMDBDataset) => {
    // Create a temporary link element to trigger download
    const link = document.createElement("a");
    link.href = dataset.url;
    link.download = `${dataset.name}.mmdb`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Topbar */}
      <div className="bg-gray-100 border-b border-gray-300 px-4 py-3">
        <div className="container mx-auto flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <a
              href="https://github.com/iv-stpn"
              target="_blank"
              rel="noopener noreferrer"
            >
              Made by <span className="font-semibold text-black">iv-stpn</span>
            </a>
          </div>
          <a
            href="https://github.com/iv-stpn/mmdb-lookup-demo"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-sm text-gray-600 hover:text-black transition-colors duration-200"
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            View on GitHub
          </a>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-6xl font-bold text-black mb-4">MMDB IP Lookup</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Test the different MMDB datasets with IP address lookups (fully
            client-side)
          </p>
        </header>

        <div className="max-w-4xl mx-auto space-y-8">
          {/* Dataset Selection */}
          <div className="bg-white border border-gray-300 rounded-2xl p-6">
            <h2 className="text-2xl font-bold text-black mb-6 flex items-center">
              <Database className="w-6 h-6 mr-3 text-gray-600" />
              Select Dataset
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {AVAILABLE_DATASETS.map((dataset) => (
                <div key={dataset.name} className="flex flex-col gap-3">
                  <div
                    className={`border rounded-xl transition-all duration-200 ${
                      selectedDataset?.name === dataset.name
                        ? "bg-gray-200 border-gray-400"
                        : "bg-white border-gray-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleDatasetSelect(dataset)}
                      disabled={loadingState.isLoading}
                      className={`w-full p-4 rounded-xl transition-all duration-200 text-left relative ${
                        selectedDataset?.name === dataset.name
                          ? "text-black"
                          : "text-black hover:bg-gray-100 hover:text-gray-800"
                      } ${loadingState.isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className="font-semibold">{dataset.name}</div>
                      <div className="text-sm opacity-75">
                        {dataset.type === "asn"
                          ? "ASN"
                          : dataset.type === "city"
                            ? "City"
                            : "Country"}{" "}
                        Data
                      </div>
                      {selectedDataset?.name === dataset.name &&
                        isDatasetLoaded && (
                          <div className="absolute top-2 right-2">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          </div>
                        )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadDataset(dataset)}
                    className="w-fit px-3 py- text-gray-700 hover:text-black rounded-lg text-sm transition-colors duration-200 flex items-center hover:underline"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download dataset
                  </button>
                </div>
              ))}
            </div>

            {/* Loading State */}
            {loadingState.isLoading && (
              <div className="bg-gray-100 border border-gray-300 rounded-xl p-6">
                <div className="flex items-center mb-4">
                  <LoaderCircle className="w-5 h-5 mr-3 text-gray-600 animate-spin" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-700 font-medium">
                        {loadingState.phase}
                      </span>
                      <span className="text-sm font-mono text-gray-600">
                        {Math.min(100, loadingState.progress)}%
                      </span>
                    </div>

                    {/* Progress details */}
                    {loadingState.loaded !== undefined &&
                      loadingState.total !== undefined &&
                      loadingState.total > 0 && (
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                          <span>
                            {formatFileSize(loadingState.loaded)} /{" "}
                            {formatFileSize(loadingState.total)}
                          </span>
                          {loadingState.speed && loadingState.speed > 0 && (
                            <span className="flex items-center gap-2">
                              <span>{formatSpeed(loadingState.speed)}</span>
                              {loadingState.loaded > 0 &&
                                loadingState.speed > 0 && (
                                  <span>
                                    ETA:{" "}
                                    {formatTime(
                                      (loadingState.total -
                                        loadingState.loaded) /
                                        loadingState.speed
                                    )}
                                  </span>
                                )}
                            </span>
                          )}
                        </div>
                      )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className="bg-gradient-to-r from-gray-600 to-gray-700 h-3 rounded-full transition-all duration-200 ease-out relative overflow-hidden"
                    style={{ width: `${Math.min(100, Math.max(loadingState.progress, 2))}%` }}
                  >
                    {/* Animated shimmer effect */}
                    {loadingState.progress > 0 &&
                      loadingState.progress < 100 && (
                        <div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"
                          style={{ animationDuration: "1.5s" }}
                        />
                      )}
                  </div>
                </div>

                {/* Additional info for completed phases */}
                {loadingState.progress === 100 && (
                  <div className="mt-3 text-sm text-gray-600 flex items-center">
                    <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                    Ready to perform lookups
                  </div>
                )}
              </div>
            )}

            {/* Dataset Status */}
            {selectedDataset && !loadingState.isLoading && (
              <div className="bg-gray-100 border border-gray-300 rounded-xl p-4">
                <div className="flex items-center">
                  {isDatasetLoaded ? (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2 text-gray-600" />
                      <span className="text-gray-700">
                        {selectedDataset.name} loaded successfully
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 mr-2 text-gray-600" />
                      <span className="text-gray-700">
                        Failed to load {selectedDataset.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* IP Lookup */}
          {selectedDataset && isDatasetLoaded && (
            <div className="bg-white border border-gray-300 rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-black mb-6 flex items-center">
                <Search className="w-6 h-6 mr-3 text-gray-600" />
                IP Address Lookup
              </h2>

              <div className="space-y-4">
                {/* IP Input */}
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                    placeholder="Enter IP address (e.g., 8.8.8.8)"
                    className="flex-1 px-4 py-3 bg-white border border-gray-300 rounded-xl text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-600"
                    onKeyPress={(e) =>
                      e.key === "Enter" && handleLookup(ipInput)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => handleLookup(ipInput)}
                    disabled={isLookingUp || !ipInput.trim()}
                    className="px-6 py-3 bg-black hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-xl transition-colors duration-200 flex items-center"
                  >
                    {isLookingUp ? (
                      <Download className="w-5 h-5 animate-spin" />
                    ) : (
                      <Search className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Sample IPs */}
                <div>
                  <p className="text-gray-600 mb-3">Try these sample IPs:</p>

                  {/* IPv4 Section */}
                  <div className="mb-4">
                    <p className="text-sm text-gray-500 mb-2">
                      IPv4 Addresses:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {userIP && !userIP.includes(":") && (
                        <button
                          type="button"
                          onClick={() => {
                            setIpInput(userIP);
                            handleLookup(userIP);
                          }}
                          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 hover:text-black rounded-lg text-sm transition-colors duration-200"
                        >
                          (your IP) <span className="font-mono">{userIP}</span>
                        </button>
                      )}
                      {SAMPLE_IPV4.map((sample) => (
                        <button
                          key={sample.ip}
                          type="button"
                          onClick={() => {
                            setIpInput(sample.ip);
                            handleLookup(sample.ip);
                          }}
                          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 hover:text-black rounded-lg text-sm transition-colors duration-200 flex items-center gap-2"
                        >
                          <sample.flag className="w-5 h-3" />
                          <span className="font-mono">{sample.ip}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* IPv6 Section */}
                  <div>
                    <p className="text-sm text-gray-500 mb-2">
                      IPv6 Addresses:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {userIP?.includes(":") && (
                        <button
                          type="button"
                          onClick={() => {
                            setIpInput(userIP);
                            handleLookup(userIP);
                          }}
                          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 hover:text-black rounded-lg text-sm transition-colors duration-200"
                        >
                          (your IP){" "}
                          <span className="font-mono text-xs">{userIP}</span>
                        </button>
                      )}
                      {SAMPLE_IPV6.map((sample) => (
                        <button
                          key={sample.ip}
                          type="button"
                          onClick={() => {
                            setIpInput(sample.ip);
                            handleLookup(sample.ip);
                          }}
                          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 hover:text-black rounded-lg text-sm transition-colors duration-200 flex items-center gap-2"
                        >
                          <sample.flag className="w-5 h-3" />
                          <span className="font-mono text-xs">{sample.ip}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Lookup Results */}
          {lookupResults.length > 0 && (
            <div className="bg-white border border-gray-300 rounded-2xl p-6">
              <h2 className="text-2xl font-bold text-black mb-6 flex items-center">
                <Globe className="w-6 h-6 mr-3 text-gray-600" />
                Lookup Results
              </h2>

              <div className="space-y-4">
                {lookupResults.map((result, index) => (
                  <div
                    key={`${result.ip}-${index}`}
                    className="bg-gray-100 border border-gray-300 rounded-xl p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono text-lg text-black font-semibold">
                        {result.ip}
                      </span>
                      <span className="text-sm text-gray-700 bg-gray-200 px-3 py-1 rounded-full">
                        {result.dataset}
                      </span>
                    </div>

                    {result.error ? (
                      <div className="text-gray-700 flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        {result.error}
                      </div>
                    ) : result.data ? (
                      <div className="space-y-3">
                        <div>
                          <span className="text-gray-700 font-semibold">
                            Data:{" "}
                          </span>
                          <span className="text-black">
                            {formatLookupData(result.ip, result.data)}
                          </span>
                        </div>
                        {result.cidrBlock && (
                          <div>
                            <span className="text-gray-700 font-semibold">
                              CIDR Block:{" "}
                            </span>
                            <span className="text-black font-mono">
                              {result.cidrBlock}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-gray-600">
                        {(() => {
                          const rangeDescription = getIPRangeDescription(
                            result.ip
                          );
                          return (
                            rangeDescription ||
                            "No data found for this IP. This address may be unallocated or not present in the MaxMind dataset."
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
