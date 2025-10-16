const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// API Key validation middleware
const validateApiKey = (req, res, next) => {
  // Skip API key validation for health endpoint
  if (req.path === '/health') {
    return next();
  }

  const apiKey = req.headers['x-api-key'];

  // Accept Chari API keys for development
  const validChariKeys = [
    'aslan_internal_key_123',
    'chari_api_key_123',
    'chari_internal_key_456',
    'demo-chari-api-key'
  ];

  if (!apiKey || !validChariKeys.includes(apiKey)) {
    return res.status(401).json({
      errorCode: 401,
      errorDescription: 'Invalid or missing Chari API key'
    });
  }

  next();
};

// Apply API key validation to all routes
app.use(validateApiKey);

// Mock database - in memory store for development
const mockData = {
  customers: {
    // Customer statuses: 0 = not exists, 1 = not confirmed, 2 = confirmed but no PIN, 3 = active, 4 = temporarily locked, 5 = permanently locked
    '+212600000001': { status: 0, message: 'Customer not found' },
    '+212600000002': { status: 1, message: 'Customer not confirmed' },
    '+212600000003': { status: 2, message: 'Customer confirmed but no PIN' },
    '+212600000004': { status: 3, message: 'Active customer' },
    '+212600000005': { status: 4, message: 'Temporarily locked' },
    '+212600000006': { status: 5, message: 'Permanently locked' },
    // Add more test numbers as needed
  },
  registrations: {
    '+212600000002': {
      firstName: 'Ahmed',
      lastName: 'Ben Ali',
      cin: 'AB123456',
      walletType: 'P',
      registeredAt: '2024-01-15T10:30:00Z'
    },
    '+212600000003': {
      firstName: 'Fatima',
      lastName: 'Zahra',
      cin: 'CD789012',
      walletType: 'P',
      registeredAt: '2024-01-20T14:15:00Z'
    },
    '+212600000004': {
      firstName: 'Mohammed',
      lastName: 'Alami',
      cin: 'EF345678',
      walletType: 'P',
      registeredAt: '2024-01-10T09:45:00Z'
    }
  },
  pins: {
    '+212600000004': '1234' // Stored for reference
  },
  balances: {
    '+212600000004': 3247.75,
    '+212600000003': 150.00,
    '+212600000002': 0.00
  },
  transactions: {
    '+212600000004': [
      {
        id: 'TXN_001',
        type: 'CASHIN',
        amount: 700.25,
        currency: 'MAD',
        date: '2024-01-26T11:15:00Z',
        description: 'Mobile money deposit',
        status: 'COMPLETED',
        balanceAfter: 3247.75
      },
      {
        id: 'TXN_002',
        type: 'CASHIN',
        amount: 500.00,
        currency: 'MAD',
        date: '2024-01-25T09:30:00Z',
        description: 'Cash deposit at agent',
        status: 'COMPLETED',
        balanceAfter: 2547.50
      },
      {
        id: 'TXN_003',
        type: 'TRANSFER_OUT',
        amount: -150.00,
        currency: 'MAD',
        date: '2024-01-24T16:45:00Z',
        description: 'Transfer to +212611111111',
        status: 'COMPLETED',
        balanceAfter: 2047.50
      },
      {
        id: 'TXN_004',
        type: 'CASHIN',
        amount: 1000.00,
        currency: 'MAD',
        date: '2024-01-22T11:20:00Z',
        description: 'Cash deposit at branch',
        status: 'COMPLETED',
        balanceAfter: 2197.50
      },
      {
        id: 'TXN_005',
        type: 'BILL_PAYMENT',
        amount: -85.50,
        currency: 'MAD',
        date: '2024-01-20T14:10:00Z',
        description: 'Electricity bill payment',
        status: 'COMPLETED',
        balanceAfter: 1197.50
      },
      {
        id: 'TXN_006',
        type: 'TRANSFER_IN',
        amount: 300.00,
        currency: 'MAD',
        date: '2024-01-18T08:55:00Z',
        description: 'Transfer from +212622222222',
        status: 'COMPLETED',
        balanceAfter: 1283.00
      }
    ],
    '+212600000003': [
      {
        id: 'TXN_007',
        type: 'CASHIN',
        amount: 150.00,
        currency: 'MAD',
        date: '2024-01-21T10:15:00Z',
        description: 'Initial deposit',
        status: 'COMPLETED',
        balanceAfter: 150.00
      }
    ]
  }
};

// Utility function to standardize API responses
const createResponse = (data, req = null) => {
  const requestId = req?.headers['c-request-id'] || uuidv4();
  return {
    data,
    c_request_id: requestId
  };
};

// Utility function to create error responses
const createErrorResponse = (errorCode, errorDescription) => ({
  errorCode,
  errorDescription
});

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Chari API Stub'
  });
});

// Customer Status - GET /customers/status
app.get('/customers/status', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Customer status check for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Check if customer exists in our mock data
  const customerStatus = mockData.customers[phoneNumber];

  if (!customerStatus || customerStatus.status === 0) {
    // Customer doesn't exist - return 204 No Content
    console.log(`[CHARI-STUB] Customer not found: ${phoneNumber}`);
    return res.status(204).send();
  }

  // Build complete customer information using the requested phone number
  const registration = mockData.registrations[phoneNumber];
  const balance = mockData.balances[phoneNumber] || 0;

  const customerInfo = {
    id: `customer-${phoneNumber.replace('+', '').replace(/\D/g, '')}`,
    phoneNumber: phoneNumber, // Use the requested phone number
    status: customerStatus.status, // Keep the numeric status as per Chari API spec
    walletType: registration?.walletType || 'P',
    balance: balance,
    currency: 'MAD',
    firstName: registration?.firstName,
    lastName: registration?.lastName,
    registeredAt: registration?.registeredAt
  };

  console.log(`[CHARI-STUB] Customer status: ${JSON.stringify(customerInfo)}`);
  res.json(createResponse(customerInfo, req));
});

// Customer Default Wallet - GET /customers/default
app.get('/customers/default', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Default wallet check for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Check if customer exists in our mock data
  const customerStatus = mockData.customers[phoneNumber];

  if (!customerStatus || customerStatus.status === 0) {
    // Customer doesn't exist
    return res.status(404).json(createErrorResponse(404, 'Customer not found'));
  }

  // For stub, assume all existing customers have default wallet
  res.json(createResponse({ isDefaultWallet: true }, req));
});

// Customer Registration - POST /customers/register
app.post('/customers/register', (req, res) => {
  const { phoneNumber, firstName, lastName, cin, walletType } = req.body;

  console.log(`[CHARI-STUB] Registration request:`, req.body);

  if (!phoneNumber || !firstName || !lastName || !cin || !walletType) {
    return res.status(400).json(createErrorResponse(400, 'Missing required fields'));
  }

  // Store registration data
  mockData.registrations[phoneNumber] = {
    firstName,
    lastName,
    cin,
    walletType,
    registeredAt: new Date().toISOString()
  };

  // Update customer status to "not confirmed"
  mockData.customers[phoneNumber] = { status: 1, message: 'Customer not confirmed' };

  console.log(`[CHARI-STUB] Customer registered: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Customer Registration Confirmation - POST /customers/confirm
app.post('/customers/confirm', (req, res) => {
  const { phoneNumber, code, walletType } = req.body;

  console.log(`[CHARI-STUB] Confirmation request for: ${phoneNumber}, code: ${code}`);

  if (!phoneNumber || !code || !walletType) {
    return res.status(400).json(createErrorResponse(400, 'Missing required fields'));
  }

  // For stub, accept "123456" as valid OTP (XXXXXX format)
  if (code !== '123456') {
    return res.status(400).json(createErrorResponse(400, 'Invalid confirmation code'));
  }

  // Update customer status to "confirmed but no PIN"
  mockData.customers[phoneNumber] = { status: 2, message: 'Customer confirmed but no PIN' };

  console.log(`[CHARI-STUB] Customer confirmed: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Resend OTP - POST /customers/confirm/resend-otp
app.post('/customers/confirm/resend-otp', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Resend OTP for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // For stub, always return success
  console.log(`[CHARI-STUB] OTP resent to: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Customer Login - POST /customers/login
app.post('/customers/login', (req, res) => {
  const { phoneNumber, pin } = req.body;

  console.log(`[CHARI-STUB] Login request for: ${phoneNumber}`);

  if (!phoneNumber || !pin) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and PIN are required'));
  }

  // Check if customer exists and has a PIN
  const customerStatus = mockData.customers[phoneNumber];
  if (!customerStatus || customerStatus.status < 3) {
    return res.status(400).json(createErrorResponse(400, 'Customer not found or not activated'));
  }

  // For stub, accept only "1234" as valid PIN (XXXX format)
  const isCorrectPin = pin === '1234';

  const response = {
    logged: isCorrectPin,
    remainingAttempts: isCorrectPin ? 3 : 2
  };

  console.log(`[CHARI-STUB] Login result: ${JSON.stringify(response)}`);
  res.json(createResponse(response, req));
});

// Create PIN - POST /customers/pin
app.post('/customers/pin', (req, res) => {
  const { phoneNumber, pin } = req.body;

  console.log(`[CHARI-STUB] Create PIN for: ${phoneNumber}`);

  if (!phoneNumber || !pin) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and PIN are required'));
  }

  // Store PIN and update customer status to active
  mockData.pins[phoneNumber] = pin;
  mockData.customers[phoneNumber] = { status: 3, message: 'Active customer' };

  console.log(`[CHARI-STUB] PIN created for: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Update PIN - PUT /customers/pin
app.put('/customers/pin', (req, res) => {
  const { phoneNumber, oldPin, newPin } = req.body;

  console.log(`[CHARI-STUB] Update PIN for: ${phoneNumber}`);

  if (!phoneNumber || !oldPin || !newPin) {
    return res.status(400).json(createErrorResponse(400, 'Phone number, old PIN, and new PIN are required'));
  }

  // For stub, always accept the update
  mockData.pins[phoneNumber] = newPin;

  console.log(`[CHARI-STUB] PIN updated for: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Customer Balance - GET /customers/balance
app.get('/customers/balance', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Balance request for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Return mock balance
  const balance = mockData.balances[phoneNumber] || 1500.00; // Default balance

  console.log(`[CHARI-STUB] Balance for ${phoneNumber}: ${balance}`);
  res.json(createResponse({ balance }, req));
});

// Customer Info - GET /customers/info
app.get('/customers/info', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Info request for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  const registration = mockData.registrations[phoneNumber];
  if (!registration) {
    return res.status(404).json(createErrorResponse(404, 'Customer not found'));
  }

  const customerInfo = {
    id: phoneNumber.replace('+', '').replace(/\D/g, ''), // Generate numeric ID from phone
    phoneNumber,
    firstName: registration.firstName,
    lastName: registration.lastName,
    cin: registration.cin,
    walletType: registration.walletType,
    status: mockData.customers[phoneNumber]?.status || 0,
    customer_status: mockData.customers[phoneNumber]?.status || 0,
    rib: `827640000010000000${phoneNumber.slice(-4)}`, // Generate fake RIB
    balance: mockData.balances[phoneNumber] || 0,
    createdAt: registration.registeredAt,
    updatedAt: new Date().toISOString()
  };

  console.log(`[CHARI-STUB] Customer info: ${JSON.stringify(customerInfo)}`);
  res.json(createResponse(customerInfo, req));
});

// Customer Transactions - GET /customers/transactions
app.get('/customers/transactions', (req, res) => {
  const { phoneNumber, limit = 10, offset = 0 } = req.query;

  console.log(`[CHARI-STUB] Transactions request for: ${phoneNumber}, limit: ${limit}, offset: ${offset}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  const transactions = mockData.transactions[phoneNumber] || [];
  const startIndex = parseInt(offset);
  const pageSize = parseInt(limit);
  const paginatedTransactions = transactions.slice(startIndex, startIndex + pageSize);

  const response = {
    transactions: paginatedTransactions,
    total: transactions.length,
    limit: pageSize,
    offset: startIndex,
    hasMore: startIndex + pageSize < transactions.length
  };

  console.log(`[CHARI-STUB] Returning ${paginatedTransactions.length} transactions for ${phoneNumber}`);
  res.json(createResponse(response, req));
});

// Customer Operations/Transfers - GET /operations
app.get('/operations', (req, res) => {
  const { phoneNumber, type, limit = 10, offset = 0 } = req.query;

  console.log(`[CHARI-STUB] Operations request for: ${phoneNumber}, type: ${type}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  let transactions = mockData.transactions[phoneNumber] || [];

  // Filter by type if specified
  if (type) {
    transactions = transactions.filter(t => t.type === type);
  }

  const startIndex = parseInt(offset);
  const pageSize = parseInt(limit);
  const paginatedTransactions = transactions.slice(startIndex, startIndex + pageSize);

  const response = {
    operations: paginatedTransactions,
    total: transactions.length,
    limit: pageSize,
    offset: startIndex,
    hasMore: startIndex + pageSize < transactions.length
  };

  console.log(`[CHARI-STUB] Returning ${paginatedTransactions.length} operations for ${phoneNumber}`);
  res.json(createResponse(response, req));
});

// Customer Unregister - DELETE /customers/unregister
app.delete('/customers/unregister', (req, res) => {
  const { phoneNumber } = req.query;

  console.log(`[CHARI-STUB] Unregister request for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Remove customer data
  delete mockData.customers[phoneNumber];
  delete mockData.registrations[phoneNumber];
  delete mockData.pins[phoneNumber];
  delete mockData.balances[phoneNumber];
  delete mockData.transactions[phoneNumber];

  console.log(`[CHARI-STUB] Customer unregistered: ${phoneNumber}`);
  res.json(createResponse(true, req));
});

// Operations endpoints

// CashIn Card Preview - POST /operations/cashin/card/preview
app.post('/operations/cashin/card/preview', (req, res) => {
  const { phoneNumber } = req.query;
  const { amount } = req.body;

  console.log(`[CHARI-STUB] CashIn preview for: ${phoneNumber}, amount: ${amount}`);

  if (!phoneNumber || !amount) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and amount are required'));
  }

  // Mock preview response
  const previewResponse = {
    type: 1,
    operation: {
      phoneNumber,
      amount,
      method: 2,
      acceptedBy: 0,
      description: ''
    },
    feesAmount: 0,
    checkedAt: new Date().toISOString(),
    openLoop: false
  };

  res.json(createResponse(previewResponse, req));
});

// Transfer Preview - POST /operations/transfer/preview
app.post('/operations/transfer/preview', (req, res) => {
  const { customerPhoneNumber, amount, reason, recipientPhoneNumber } = req.body;

  console.log(`[CHARI-STUB] Transfer preview from: ${customerPhoneNumber}, to: ${recipientPhoneNumber}, amount: ${amount}`);

  if (!customerPhoneNumber || !amount || !recipientPhoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Missing required fields'));
  }

  // Mock transfer preview response
  const previewResponse = {
    type: 3,
    operation: {
      customerPhoneNumber,
      amount,
      reason: reason || '',
      beneficiaryId: null,
      recipientPhoneNumber
    },
    feesAmount: 0,
    totalAmount: amount,
    checkedAt: new Date().toISOString(),
    openLoop: false
  };

  res.json(createResponse(previewResponse, req));
});

// Transfer Execute - POST /operations/transfer
app.post('/operations/transfer', (req, res) => {
  const { customerPhoneNumber, amount, reason, recipientPhoneNumber } = req.body;

  console.log(`[CHARI-STUB] Transfer execution from: ${customerPhoneNumber}, to: ${recipientPhoneNumber}, amount: ${amount}`);

  if (!customerPhoneNumber || !amount || !recipientPhoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Missing required fields'));
  }

  // Check if sender exists and has sufficient balance
  const senderStatus = mockData.customers[customerPhoneNumber];
  if (!senderStatus || senderStatus.status < 3) {
    return res.status(400).json(createErrorResponse(400, 'Sender not found or not activated'));
  }

  const senderBalance = mockData.balances[customerPhoneNumber] || 0;
  if (senderBalance < amount) {
    return res.status(400).json(createErrorResponse(400, 'Insufficient balance'));
  }

  // Update balances
  mockData.balances[customerPhoneNumber] = senderBalance - amount;
  const recipientBalance = mockData.balances[recipientPhoneNumber] || 0;
  mockData.balances[recipientPhoneNumber] = recipientBalance + amount;

  // Mock transfer response
  const transferResponse = {
    operationType: 3,
    amount,
    feesAmount: 0,
    totalAmount: amount,
    reason: reason || '',
    recipientPhoneNumber,
    checkedAt: new Date().toISOString()
  };

  res.json(createResponse(transferResponse, req));
});

// Get Operations - GET /operations
app.get('/operations', (req, res) => {
  const { phoneNumber, operationType, transactionStatus, pageSize = 10, pageNumber = 1 } = req.query;

  console.log(`[CHARI-STUB] Get operations for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Get transactions for this customer
  let transactions = mockData.transactions[phoneNumber] || [];

  // Apply filters if provided
  if (operationType) {
    const opTypes = Array.isArray(operationType) ? operationType : [operationType];
    transactions = transactions.filter(t => opTypes.includes(t.type.toString()));
  }

  if (transactionStatus) {
    transactions = transactions.filter(t => t.status === parseInt(transactionStatus));
  }

  // Apply pagination
  const startIndex = (parseInt(pageNumber) - 1) * parseInt(pageSize);
  const endIndex = startIndex + parseInt(pageSize);
  const paginatedTransactions = transactions.slice(startIndex, endIndex);

  // Convert to expected format
  const operations = paginatedTransactions.map((tx, index) => ({
    operationId: startIndex + index + 1,
    transactionId: parseInt(tx.id.replace('TXN_', '')),
    amount: Math.abs(tx.amount),
    reason: tx.description,
    transactionDate: tx.date,
    operationType: tx.type === 'CASHIN' ? 1 : tx.type === 'CASHOUT' ? 2 : 3,
    accountNumber: phoneNumber,
    beneficiaryName: '',
    transactionStatus: 2, // completed
    sens: tx.amount > 0 ? 1 : 2 // credit : debit
  }));

  const response = {
    collection: operations,
    count: operations.length
  };

  res.json(createResponse(response, req));
});

// Beneficiary Management

// Get Beneficiaries - GET /customer/beneficiaries
app.get('/customer/beneficiaries', (req, res) => {
  const { phoneNumber, pageSize = 10, pageNumber = 1 } = req.query;

  console.log(`[CHARI-STUB] Get beneficiaries for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Mock beneficiaries data
  const mockBeneficiaries = [
    {
      id: 1,
      customerId: 1,
      name: 'Ahmed Benali',
      phoneNumber: '+212611111111',
      createdAt: '2025-01-15T10:30:00Z',
      isVisible: true,
      rib: null,
      email: 'ahmed@example.com'
    },
    {
      id: 2,
      customerId: 1,
      name: 'Fatima Zahra',
      phoneNumber: null,
      createdAt: '2025-01-20T14:15:00Z',
      isVisible: true,
      rib: '827640000010000000001234',
      email: null
    }
  ];

  const startIndex = (parseInt(pageNumber) - 1) * parseInt(pageSize);
  const endIndex = startIndex + parseInt(pageSize);
  const paginatedBeneficiaries = mockBeneficiaries.slice(startIndex, endIndex);

  const response = {
    collection: paginatedBeneficiaries,
    count: mockBeneficiaries.length
  };

  res.json(createResponse(response, req));
});

// Add Beneficiary - POST /customer/beneficiaries
app.post('/customer/beneficiaries', (req, res) => {
  const { phoneNumber } = req.query;
  const { name, phoneNumber: beneficiaryPhone, rib, email } = req.body;

  console.log(`[CHARI-STUB] Add beneficiary for: ${phoneNumber}`);

  if (!phoneNumber || !name) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and name are required'));
  }

  if (!beneficiaryPhone && !rib) {
    return res.status(400).json(createErrorResponse(400, 'Either phone number or RIB must be provided'));
  }

  // Mock beneficiary creation
  const newBeneficiary = {
    id: Math.floor(Math.random() * 1000),
    customerId: 1,
    name,
    phoneNumber: beneficiaryPhone || null,
    createdAt: new Date().toISOString(),
    isVisible: true,
    rib: rib || null,
    email: email || null
  };

  res.json(createResponse(newBeneficiary, req));
});

// Update Beneficiary - PUT /customer/beneficiaries/{id}
app.put('/customer/beneficiaries/:id', (req, res) => {
  const { phoneNumber } = req.query;
  const { id } = req.params;
  const { name, phoneNumber: beneficiaryPhone, rib, email } = req.body;

  console.log(`[CHARI-STUB] Update beneficiary ${id} for: ${phoneNumber}`);

  if (!phoneNumber || !name) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and name are required'));
  }

  // Mock beneficiary update
  const updatedBeneficiary = {
    BeneficiaryId: parseInt(id),
    userId: 1,
    name,
    phoneNumber: beneficiaryPhone || null,
    createdAt: '2025-01-15T10:30:00Z',
    isVisible: true,
    rib: rib || null,
    email: email || null
  };

  res.json(createResponse(updatedBeneficiary, req));
});

// Delete Beneficiary - DELETE /customer/beneficiaries/{id}
app.delete('/customer/beneficiaries/:id', (req, res) => {
  const { phoneNumber } = req.query;
  const { id } = req.params;

  console.log(`[CHARI-STUB] Delete beneficiary ${id} for: ${phoneNumber}`);

  if (!phoneNumber) {
    return res.status(400).json(createErrorResponse(400, 'Phone number is required'));
  }

  // Mock beneficiary deletion
  res.json(createResponse(true, req));
});

// Request Operations

// Request CashIn - POST /operations/cashin/request
app.post('/operations/cashin/request', (req, res) => {
  const { PhoneNumber, amount } = req.body;

  console.log(`[CHARI-STUB] CashIn request for: ${PhoneNumber}, amount: ${amount}`);

  if (!PhoneNumber || !amount) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and amount are required'));
  }

  // Mock cashin request
  const reference = `OR01-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}${String(new Date().getHours()).padStart(2, '0')}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;

  const cashInRequest = {
    createdAt: new Date().toISOString(),
    closedAt: null,
    reference,
    phoneNumber: PhoneNumber,
    accountId: 1,
    operationType: 1,
    operationStatus: 1,
    partnerId: 1,
    amount,
    description: 'CashIn request'
  };

  res.json(createResponse(cashInRequest, req));
});

// Request CashOut - POST /operations/cashout/request
app.post('/operations/cashout/request', (req, res) => {
  const { PhoneNumber, amount } = req.body;

  console.log(`[CHARI-STUB] CashOut request for: ${PhoneNumber}, amount: ${amount}`);

  if (!PhoneNumber || !amount) {
    return res.status(400).json(createErrorResponse(400, 'Phone number and amount are required'));
  }

  // Mock cashout request
  const reference = `OR02-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}${String(new Date().getHours()).padStart(2, '0')}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;

  const cashOutRequest = {
    createdAt: new Date().toISOString(),
    closedAt: null,
    reference,
    phoneNumber: PhoneNumber,
    accountId: 1,
    operationType: 2,
    operationStatus: 1,
    partnerId: 1,
    amount,
    description: 'CashOut request'
  };

  res.json(createResponse(cashOutRequest, req));
});

// Get CashIn By Reference - GET /operations/cashin/request
app.get('/operations/cashin/request', (req, res) => {
  const { reference } = req.query;

  console.log(`[CHARI-STUB] Get CashIn by reference: ${reference}`);

  if (!reference) {
    return res.status(400).json(createErrorResponse(400, 'Reference is required'));
  }

  // Mock cashin operation
  const operation = {
    reference,
    entity: null,
    createdAt: '2025-06-03T09:37:26.881973',
    executedAt: null,
    phoneNumber: '+212600000004',
    amount: 1000.0,
    description: null,
    partner: 'ChariMoney',
    status: 1,
    type: 1
  };

  res.json(createResponse(operation, req));
});

// Get CashOut By Reference - GET /operations/cashout/request
app.get('/operations/cashout/request', (req, res) => {
  const { reference } = req.query;

  console.log(`[CHARI-STUB] Get CashOut by reference: ${reference}`);

  if (!reference) {
    return res.status(400).json(createErrorResponse(400, 'Reference is required'));
  }

  // Mock cashout operation
  const operation = {
    reference,
    entity: null,
    createdAt: '2025-06-03T09:37:26.881973',
    executedAt: null,
    phoneNumber: '+212600000004',
    amount: 500.0,
    description: null,
    partner: 'ChariMoney',
    status: 1,
    type: 2
  };

  res.json(createResponse(operation, req));
});

// Catch-all for unimplemented endpoints
app.use((req, res) => {
  console.log(`[CHARI-STUB] Unimplemented endpoint: ${req.method} ${req.path}`);
  res.status(501).json(createErrorResponse(501, `Endpoint not implemented: ${req.method} ${req.path}`));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[CHARI-STUB] Error:`, err);
  res.status(500).json(createErrorResponse(500, 'Internal server error'));
});

// Start server
app.listen(PORT, () => {
  console.log(`[CHARI-STUB] Server running on port ${PORT}`);
  console.log(`[CHARI-STUB] Health check: http://localhost:${PORT}/health`);
  console.log(`[CHARI-STUB] Mock customers available:`);
  Object.entries(mockData.customers).forEach(([phone, status]) => {
    console.log(`  ${phone}: ${JSON.stringify(status)}`);
  });
});