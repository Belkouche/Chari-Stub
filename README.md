# Chari API Stub

A mock API server that simulates the Chari BaaS API for development and testing purposes.

## Features

- Mock implementation of all customer-related endpoints
- Proper HTTP status codes and response formats
- In-memory data storage for testing different scenarios
- Request/response logging for debugging
- CORS and security headers included

## Installation

```bash
npm install
```

## Usage

### Development Mode (with auto-restart)
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on port 4000 by default.

## API Endpoints

### Customer Management
- `GET /customers/status` - Check customer status
- `GET /customers/default` - Check default wallet status
- `POST /customers/register` - Register new customer
- `POST /customers/confirm` - Confirm registration with OTP
- `POST /customers/confirm/resend-otp` - Resend OTP
- `POST /customers/login` - Customer login with PIN
- `POST /customers/pin` - Create customer PIN
- `PUT /customers/pin` - Update customer PIN
- `GET /customers/balance` - Get customer balance
- `GET /customers/info` - Get customer information
- `DELETE /customers/unregister` - Unregister customer

### Transactions
- `GET /customers/transactions` - Get paginated transaction list (supports `limit`, `offset`, `page`)
- `GET /customers/transactions/:transactionId` - Get single transaction by ID

### Operations
- `GET /operations` - Get paginated operations list with filtering (supports `pageSize`, `pageNumber`, `operationType`, `transactionStatus`)
- `GET /operations/:operationId` - Get single operation by ID

### Health Check
- `GET /health` - Server health status

## Data Format & Coherence

### Transaction vs Operation Format

The API provides two views of the same underlying data:

**Transaction Format** (raw format from `/customers/transactions`):
- Returns actual transaction records as stored
- Amounts can be positive (credits) or negative (debits)
- Status: `COMPLETED`, `PENDING`
- Types: `CASHIN`, `CASHOUT`, `TRANSFER_IN`, `TRANSFER_OUT`, `BILL_PAYMENT`

**Operation Format** (formatted view from `/operations`):
- Transforms transactions into standardized operation records
- Amounts are always absolute values
- Status codes: `1` (pending), `2` (completed)
- Operation type codes: `1` (CASHIN), `2` (CASHOUT), `3` (TRANSFER), `4` (BILL_PAYMENT)
- Sens: `1` (credit/incoming), `2` (debit/outgoing)
- Includes `beneficiaryName` for transfers

Both endpoints always return coherent data - the same transaction will have matching amounts, dates, and descriptions across both formats.

### Pagination

All list endpoints support pagination with metadata:
- `total` - Total number of records
- `page`/`pageNumber` - Current page
- `totalPages` - Total number of pages
- `hasMore` - Boolean indicating if more pages exist
- `hasPrevious` - Boolean indicating if previous pages exist

## Test Data

The stub comes with pre-configured test customers with **25 fake transactions each**:

| Phone Number | Status | Description |
|--------------|--------|-------------|
| +212600000001 | 0 | Customer not found (will return 204) |
| +212600000002 | 1 | Customer not confirmed |
| +212600000003 | 2 | Customer confirmed but no PIN |
| +212600000004 | 3 | Active customer |

## Authentication

All endpoints (except `/health`) require an API key header:
```
x-api-key: aslan_internal_key_123
```

## Test Credentials

- **OTP Code**: `1234` (for confirmation)
- **PIN**: `1234` (for login and PIN creation)

## Example Usage

### Transaction & Operation Examples

```bash
# Get paginated transactions (page 1, 10 items)
curl -H "x-api-key: aslan_internal_key_123" \
  "http://localhost:4000/customers/transactions?phoneNumber=+212600000004&limit=10&page=1"

# Get single transaction by ID
curl -H "x-api-key: aslan_internal_key_123" \
  "http://localhost:4000/customers/transactions/5?phoneNumber=+212600000004"

# Get paginated operations with filtering
curl -H "x-api-key: aslan_internal_key_123" \
  "http://localhost:4000/operations?phoneNumber=+212600000004&pageSize=10&pageNumber=1&operationType=CASHIN"

# Get single operation by ID
curl -H "x-api-key: aslan_internal_key_123" \
  "http://localhost:4000/operations/5?phoneNumber=+212600000004"
```

### Customer Management Examples

```bash
# Check customer status (non-existent customer)
curl -H "x-api-key: aslan_internal_key_123" \
  "http://localhost:4000/customers/status?phoneNumber=+212600000001"

# Register new customer
curl -X POST -H "Content-Type: application/json" \
  -H "x-api-key: aslan_internal_key_123" \
  -d '{
    "phoneNumber": "+212600000001",
    "firstName": "Ahmed",
    "lastName": "Benali",
    "cin": "AB123456",
    "walletType": "P"
  }' \
  http://localhost:4000/customers/register

# Confirm registration
curl -X POST -H "Content-Type: application/json" \
  -H "x-api-key: aslan_internal_key_123" \
  -d '{
    "phoneNumber": "+212600000001",
    "code": "1234",
    "walletType": "P"
  }' \
  http://localhost:4000/customers/confirm

# Create PIN
curl -X POST -H "Content-Type: application/json" \
  -H "x-api-key: aslan_internal_key_123" \
  -d '{
    "phoneNumber": "+212600000001",
    "pin": "1234"
  }' \
  http://localhost:4000/customers/pin

# Login
curl -X POST -H "Content-Type: application/json" \
  -H "x-api-key: aslan_internal_key_123" \
  -d '{
    "phoneNumber": "+212600000001",
    "pin": "1234"
  }' \
  http://localhost:4000/customers/login
```

## Logging

The server logs all requests and responses to help with debugging. Look for `[CHARI-STUB]` prefixed messages in the console.

## Development Notes

- Data is stored in memory and will be lost when the server restarts
- All mock responses follow the same format as the real Chari API
- Error responses include proper HTTP status codes and error messages
- The stub is designed to work seamlessly with the Aslan frontend application