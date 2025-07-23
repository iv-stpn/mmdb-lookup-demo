# MMDB IP Lookup

A simplified React TypeScript web application for testing MaxMind Database (MMDB) files with IP address lookups. This tool allows you to load MMDB datasets directly in your browser and perform real-time IP geolocation and network information queries.

## Features

- **Dataset Selection**: Choose from ASN, City, or Country MMDB datasets
- **IP Lookup**: Query IPv4 and IPv6 addresses to get geographical or network information
- **Reserved IP detection**: Identifies reserved, private, and special-use IP ranges with detailed explanations
- **Your IP Detection**: Automatically detects and displays your public IP address to test it easily
- **Client-side Processing**: All MMDB processing happens in the browser - no server required
- **Dataset Downloads**: Direct download links for each MMDB dataset

## Available Datasets

- **GeoLite2-ASN**: Autonomous System Number information
- **GeoLite2-City**: City-level geographical data
- **GeoLite2-Country**: Country-level geographical data

Provided with a free license key by MaxMind, under the GeoLite2 License. 

Find more free datasets in the [ip-location-db repository](https://github.com/sapics/ip-location-db).

## Libraries used

- **React** with TypeScript
- **Vite** for build tooling and development
- **mmdb-lib** for MMDB file processing
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **country-flag-icons** for country flag display

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd mmdb-lookup-demo
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

## Usage

1. **Select a Dataset**: Choose from the available MMDB datasets (ASN, City, Country)
2. **Wait for Loading**: The application will download and process the selected dataset client-side
3. **Test Your IP**: Your public IP is automatically detected and displayed
4. **Try Sample IPs**: Click on any of the provided IPv4 or IPv6 sample addresses
5. **Lookup Custom IPs**: Enter any IP address to get detailed information
6. **Understand Results**: 
   - **Public IPs**: Get geographical location, city, country, or ASN information
   - **Reserved IPs**: Receive detailed explanations for private, loopback, multicast, and other special-use addresses
   - **Unknown IPs**: Get informed whether an IP is likely unallocated or simply not in the MaxMind dataset

## What You'll See

### For Public IPs:
- **ASN Dataset**: Autonomous System Number and organization name
- **City Dataset**: City name, country, and coordinates
- **Country Dataset**: Country and continent information
- **CIDR Block**: The network block the IP belongs to

### For Reserved/Special IPs:
The application identifies and explains various reserved IP ranges:
- **Private Networks** (RFC 1918): 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
- **Loopback Addresses**: 127.0.0.0/8 (IPv4), ::1 (IPv6)
- **Link-Local**: 169.254.0.0/16 (IPv4), fe80::/10 (IPv6)
- **Multicast**: 224.0.0.0/4 (IPv4), ff00::/8 (IPv6)
- **Documentation**: RFC 5737 addresses used in examples
- **And more** according to various RFCs

## Dataset Information

The application loads MMDB datasets from the `/public/mmdb/` directory:
- **GeoLite2-ASN.mmdb**: Autonomous System Number and organization data
- **GeoLite2-City.mmdb**: City-level geographical data with coordinates
- **GeoLite2-Country.mmdb**: Country and continent-level data

They are sourced from P3TERX's GeoLite.mmdb repository:
- [GeoLite2-ASN.mmdb](https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-ASN.mmdb)
- [GeoLite2-City.mmdb](https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb)
- [GeoLite2-Country.mmdb](https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-Country.mmdb)


## Development

### Project Structure

```
src/
├── App.tsx             # Main application component with UI and lookup logic
├── mmdb.ts             # MMDB file handling, IP validation, and range detection
├── types.ts            # TypeScript type definitions
├── index.css           # Tailwind CSS styles
└── main.tsx            # Application entry point

public/
└── mmdb/               # MMDB dataset files
    ├── GeoLite2-ASN.mmdb
    ├── GeoLite2-City.mmdb
    └── GeoLite2-Country.mmdb
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run Biome linter

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
