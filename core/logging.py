# logging.py
# Unified logging utilities for CLI and file output
#
# 🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
# 📖 System Overview: ~/rules/system-overview.md
# 🏗️ Project Structure: ~/rules/project-structure.md  
# 🌐 API Patterns: ~/rules/api-patterns.md
# 💻 Coding Standards: ~/rules/coding-standards.md

import os
import logging
from logging.handlers import RotatingFileHandler

# Logging System
def setup_logger(name, log_file, level=logging.INFO):
    """Setup a logger with rotating file handler"""
    # Ensure logs directory exists
    logs_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
    os.makedirs(logs_dir, exist_ok=True)
    
    # Create logger
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Clear existing handlers to avoid duplicates
    logger.handlers.clear()
    
    # Create rotating file handler (10MB max, keep 5 backup files)
    handler = RotatingFileHandler(
        os.path.join(logs_dir, log_file),
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    
    # Create formatter
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    
    # Add handler to logger
    logger.addHandler(handler)
    
    return logger

def log_event(logger, level, message, **kwargs):
    """Log an event with optional additional context"""
    if kwargs:
        context = ' '.join([f"{k}={v}" for k, v in kwargs.items()])
        message = f"{message} | {context}"
    
    if level.upper() == 'DEBUG':
        logger.debug(message)
    elif level.upper() == 'INFO':
        logger.info(message)
    elif level.upper() == 'WARN':
        logger.warning(message)
    elif level.upper() == 'ERROR':
        logger.error(message)
    elif level.upper() == 'CRITICAL':
        logger.critical(message) 