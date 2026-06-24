const http = require('http');

const data = JSON.stringify({
  templates: [
    {
      id: "default_1",
      name: "基础数据查询",
      category: "走势分析",
      sql: "-- 基础广告数据查询\nSELECT * FROM test;",
      createdAt: 1718700000000,
      updatedAt: Date.now()
    }
  ]
});

const options = {
  hostname: 'localhost',
  port: 5173,
  path: '/api/sql-templates',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
