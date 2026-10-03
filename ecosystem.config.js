module.exports = {
  apps: [
    {
      name: 'dconnect-server',
      script: './server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      error_file: './logs/server-err.log',
      out_file: './logs/server-out.log',
      time: true
    },
    {
      name: 'dconnect-ml-service',
      script: 'api_service.py',
      interpreter: 'python',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        PORT: 8000
      },
      error_file: './logs/ml-err.log',
      out_file: './logs/ml-out.log',
      time: true
    },
    {
      name: 'dconnect-health-watchdog',
      script: './health_monitor.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        PORT: 3000,
        HEALTH_CHECK_INTERVAL_MS: 30000
      },
      error_file: './logs/watchdog-err.log',
      out_file: './logs/watchdog-out.log',
      time: true
    }
  ]
};
