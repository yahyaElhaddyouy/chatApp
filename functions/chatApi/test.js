const main = require('./src/main.js');

// Set dummy API key for testing
process.env.APPWRITE_API_KEY = 'dummy_key_for_testing';

async function testCreateDm() {
  console.log('Testing createDm with valid inputs...');
  const mockContext = {
    req: {
      body: JSON.stringify({ action: "createDm", otherEmail: "test@example.com", userId: "123" }),
      bodyJson: { action: "createDm", otherEmail: "test@example.com", userId: "123" }
    },
    res: {},
    log: console.log,
    error: console.error
  };

  try {
    const result = await main(mockContext);
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function testMissingAction() {
  console.log('Testing missing action...');
  const mockContext = {
    req: {
      body: JSON.stringify({ otherEmail: "test@example.com", userId: "123" }),
      bodyJson: { otherEmail: "test@example.com", userId: "123" }
    },
    res: {},
    log: console.log,
    error: console.error
  };

  try {
    const result = await main(mockContext);
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function testMissingFields() {
  console.log('Testing missing fields...');
  const mockContext = {
    req: {
      body: JSON.stringify({ action: "createDm", userId: "123" }),
      bodyJson: { action: "createDm", userId: "123" }
    },
    res: {},
    log: console.log,
    error: console.error
  };

  try {
    const result = await main(mockContext);
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

async function runTests() {
  await testCreateDm();
  await testMissingAction();
  await testMissingFields();
}

runTests();
