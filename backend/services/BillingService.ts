import axios, { AxiosResponse } from 'axios';
import logger from '../utils/logger';

export interface BillingUsage {
  id: string;
  name: string;
  type: string;
  unit: string;
  usageStart: string;
  usageEnd: string;
  quantity: number;
  meterId: string;
  meterName: string;
  meterCategory: string;
  meterSubCategory: string;
  meterRegion: string;
  unitPrice: number;
  cost: number;
  currency: string;
}

export interface BillingPeriod {
  startDate: string;
  endDate: string;
  totalCost: number;
  currency: string;
  usageDetails: BillingUsage[];
}

export interface ResourceBilling {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  location: string;
  totalCost: number;
  currency: string;
  usageBreakdown: {
    speech: number;
    translation: number;
    other: number;
  };
  lastUpdated: string;
}

export interface AccountBalance {
  subscriptionId: string;
  availableCredit: number;
  totalCredit: number;
  usedCredit: number;
  currency: string;
  creditExpiry?: string;
  spendingLimit?: number;
  remainingDays?: number;
  lastUpdated: string;
}

export interface UsageStatistics {
  subscriptionId: string;
  currentPeriod: {
    startDate: string;
    endDate: string;
    totalCost: number;
    totalUsage: number;
  };
  serviceUsage: {
    speechServices: {
      apiCalls: number;
      cost: number;
      charactersProcessed?: number;
      audioMinutes?: number;
    };
    translationServices: {
      apiCalls: number;
      cost: number;
      charactersTranslated?: number;
    };
    otherServices: {
      apiCalls: number;
      cost: number;
    };
  };
  quotaUsage: {
    speechQuota: {
      used: number;
      limit: number;
      unit: string;
    };
    translationQuota: {
      used: number;
      limit: number;
      unit: string;
    };
  };
  lastUpdated: string;
}

export class BillingService {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private azureCLI: any; // 引用AzureCLIService

  constructor(azureCLIService: any) {
    this.azureCLI = azureCLIService;
  }

  /**
   * 获取Azure访问令牌
   */
  private async getAccessToken(): Promise<string> {
    if (this.azureCLI) {
      return await this.azureCLI.getAccessToken();
    }
    
    // 如果没有Azure CLI服务，使用环境变量
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiry) {
      return this.accessToken!;
    }

    try {
      const tokenUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT}/oauth2/token`;
      const tokenData = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AZURE_APP_ID || '',
        client_secret: process.env.AZURE_PASSWORD || '',
        resource: 'https://management.azure.com/'
      });

      const response: AxiosResponse = await axios.post(tokenUrl, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      if (response.status === 200) {
        this.accessToken = response.data.access_token;
        this.tokenExpiry = now + (response.data.expires_in - 300) * 1000;
        return this.accessToken!;
      } else {
        throw new Error(`Failed to get access token: ${response.status}`);
      }
    } catch (error: any) {
      logger.error('Error getting Azure access token for billing:', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * 获取订阅的账单使用情况
   */
  async getBillingUsage(subscriptionId: string, startDate?: string, endDate?: string): Promise<BillingPeriod> {
    try {
      const token = await this.getAccessToken();
      
      // 如果没有指定日期，使用当前月份
      const now = new Date();
      const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const end = endDate || now.toISOString().split('T')[0];

      // 使用Cost Management API获取费用数据
      const response: AxiosResponse = await axios.post(
        `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-03-01`,
        {
          type: 'Usage',
          timeframe: 'Custom',
          timePeriod: {
            from: start,
            to: end
          },
          dataset: {
            granularity: 'Daily',
            aggregation: {
              totalCost: {
                name: 'PreTaxCost',
                function: 'Sum'
              }
            },
            grouping: [
              {
                type: 'Dimension',
                name: 'ResourceId'
              },
              {
                type: 'Dimension', 
                name: 'MeterCategory'
              }
            ]
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.status === 200) {
        const rows = response.data.properties?.rows || [];
        const columns = response.data.properties?.columns || [];
        
        // 找到成本列的索引
        const costColumnIndex = columns.findIndex((col: any) => col.name === 'PreTaxCost');
        const resourceIdIndex = columns.findIndex((col: any) => col.name === 'ResourceId');
        const meterCategoryIndex = columns.findIndex((col: any) => col.name === 'MeterCategory');
        
        const usageDetails = rows.map((row: any[]) => ({
          id: row[resourceIdIndex] || 'unknown',
          name: 'Usage Detail',
          type: 'Microsoft.Consumption/usageDetails',
          unit: 'USD',
          usageStart: start,
          usageEnd: end,
          quantity: 1,
          meterId: 'unknown',
          meterName: 'Cost',
          meterCategory: row[meterCategoryIndex] || 'Unknown',
          meterSubCategory: 'Unknown',
          meterRegion: 'Unknown',
          unitPrice: row[costColumnIndex] || 0,
          cost: row[costColumnIndex] || 0,
          currency: 'USD'
        }));
        
        const totalCost = rows.reduce((sum: number, row: any[]) => sum + (row[costColumnIndex] || 0), 0);

        return {
          startDate: start,
          endDate: end,
          totalCost,
          currency: 'USD',
          usageDetails
        };
      } else {
        throw new Error(`Failed to get billing usage: ${response.status}`);
      }
    } catch (error: any) {
      logger.error('Error getting billing usage:', error);
      throw error;
    }
  }

  /**
   * 获取账户余额信息
   */
  async getAccountBalance(subscriptionId: string): Promise<AccountBalance> {
    try {
      const token = await this.getAccessToken();
      
      // 获取订阅信息
      const subscriptionResponse = await axios.get(
        `https://management.azure.com/subscriptions/${subscriptionId}?api-version=2020-01-01`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      // 获取当前月份的费用数据来计算已使用的金额
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const currentDate = now.toISOString().split('T')[0];
      
      const billingData = await this.getBillingUsage(subscriptionId, startOfMonth, currentDate);
      const usedCredit = billingData.totalCost;

      // 尝试获取支出限制信息（如果有的话）
      let spendingLimit: number | undefined;
      let totalCredit = 0;
      
      try {
        // 对于有支出限制的订阅，尝试获取限制信息
        const rateCardResponse = await axios.get(
          `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.Commerce/RateCard?api-version=2016-08-31-preview&$filter=OfferDurableId eq 'MS-AZR-0044P'`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          }
        );
        
        // 从OfferTerms中提取信用额度信息
        const offerTerms = rateCardResponse.data?.OfferTerms || [];
        const creditTerm = offerTerms.find((term: any) => term.Name === 'Monetary Credit');
        if (creditTerm) {
          totalCredit = creditTerm.Credit || 0;
          spendingLimit = totalCredit;
        }
      } catch (error) {
        // 如果无法获取RateCard信息，使用默认值
        logger.warn('Could not fetch rate card info, using estimated values:', error);
        totalCredit = 200; // 默认免费试用额度
        spendingLimit = totalCredit;
      }

      const availableCredit = Math.max(0, totalCredit - usedCredit);
      
      // 计算剩余天数（基于当前月份）
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const remainingDays = Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      return {
        subscriptionId,
        availableCredit,
        totalCredit,
        usedCredit,
        currency: 'USD',
        spendingLimit,
        remainingDays,
        lastUpdated: new Date().toISOString()
      };
    } catch (error: any) {
      logger.error('Error getting account balance:', error);
      throw error;
    }
  }

  /**
   * 获认知服务的详细账单
   */
  async getCognitiveServicesBilling(subscriptionId: string): Promise<ResourceBilling[]> {
    try {
      const billingPeriod = await this.getBillingUsage(subscriptionId);
      const cognitiveServices: { [key: string]: ResourceBilling } = {};

      // 过滤认知服务相关的使用情况
      const cognitiveUsage = billingPeriod.usageDetails.filter(usage => 
        usage.meterCategory.toLowerCase().includes('cognitive') ||
        usage.meterCategory.toLowerCase().includes('speech') ||
        usage.meterCategory.toLowerCase().includes('translator') ||
        usage.meterName.toLowerCase().includes('speech') ||
        usage.meterName.toLowerCase().includes('translator')
      );

      // 按资源分组
      for (const usage of cognitiveUsage) {
        const resourceId = usage.id.split('/').slice(0, -1).join('/');
        
        if (!cognitiveServices[resourceId]) {
          cognitiveServices[resourceId] = {
            resourceId,
            resourceName: usage.name,
            resourceType: usage.type,
            location: usage.meterRegion || 'Unknown',
            totalCost: 0,
            currency: usage.currency,
            usageBreakdown: {
              speech: 0,
              translation: 0,
              other: 0
            },
            lastUpdated: new Date().toISOString()
          };
        }

        const service = cognitiveServices[resourceId];
        service.totalCost += usage.cost;

        // 分类使用情况
        if (usage.meterName.toLowerCase().includes('speech') || 
            usage.meterCategory.toLowerCase().includes('speech')) {
          service.usageBreakdown.speech += usage.cost;
        } else if (usage.meterName.toLowerCase().includes('translator') || 
                   usage.meterCategory.toLowerCase().includes('translator')) {
          service.usageBreakdown.translation += usage.cost;
        } else {
          service.usageBreakdown.other += usage.cost;
        }
      }

      return Object.values(cognitiveServices);
    } catch (error: any) {
      logger.error('Error getting cognitive services billing:', error);
      throw error;
    }
  }

  /**
   * 获取实时计费统计
   */
  /**
   * 获取详细的使用情况统计
   */
  async getUsageStatistics(subscriptionId: string): Promise<UsageStatistics> {
    try {
      const token = await this.getAccessToken();
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const currentDate = now.toISOString().split('T')[0];
      
      // 获取详细的使用数据
      const response = await axios.post(
        `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-03-01`,
        {
          type: 'Usage',
          timeframe: 'Custom',
          timePeriod: {
            from: startOfMonth,
            to: currentDate
          },
          dataset: {
            granularity: 'Daily',
            aggregation: {
              totalCost: {
                name: 'PreTaxCost',
                function: 'Sum'
              },
              usageQuantity: {
                name: 'UsageQuantity',
                function: 'Sum'
              }
            },
            grouping: [
              {
                type: 'Dimension',
                name: 'MeterCategory'
              },
              {
                type: 'Dimension',
                name: 'MeterSubCategory'
              },
              {
                type: 'Dimension',
                name: 'MeterName'
              }
            ]
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const rows = response.data.properties?.rows || [];
      const columns = response.data.properties?.columns || [];
      
      // 找到各列的索引
      const costIndex = columns.findIndex((col: any) => col.name === 'PreTaxCost');
      const quantityIndex = columns.findIndex((col: any) => col.name === 'UsageQuantity');
      const categoryIndex = columns.findIndex((col: any) => col.name === 'MeterCategory');
      const subCategoryIndex = columns.findIndex((col: any) => col.name === 'MeterSubCategory');
      const meterNameIndex = columns.findIndex((col: any) => col.name === 'MeterName');

      // 初始化统计数据
      let totalCost = 0;
      let totalUsage = 0;
      const speechServices = { apiCalls: 0, cost: 0, charactersProcessed: 0, audioMinutes: 0 };
      const translationServices = { apiCalls: 0, cost: 0, charactersTranslated: 0 };
      const otherServices = { apiCalls: 0, cost: 0 };

      // 处理每一行数据
      rows.forEach((row: any[]) => {
        const cost = row[costIndex] || 0;
        const quantity = row[quantityIndex] || 0;
        const category = (row[categoryIndex] || '').toLowerCase();
        const subCategory = (row[subCategoryIndex] || '').toLowerCase();
        const meterName = (row[meterNameIndex] || '').toLowerCase();

        totalCost += cost;
        totalUsage += quantity;

        // 分类统计
        if (category.includes('cognitive') || category.includes('speech') || subCategory.includes('speech')) {
          speechServices.cost += cost;
          speechServices.apiCalls += quantity;
          
          // 根据计量器名称估算处理的字符数或音频分钟数
          if (meterName.includes('character') || meterName.includes('text')) {
            speechServices.charactersProcessed += quantity;
          } else if (meterName.includes('audio') || meterName.includes('minute')) {
            speechServices.audioMinutes += quantity;
          }
        } else if (category.includes('translator') || subCategory.includes('translation')) {
          translationServices.cost += cost;
          translationServices.apiCalls += quantity;
          
          if (meterName.includes('character')) {
            translationServices.charactersTranslated += quantity;
          }
        } else {
          otherServices.cost += cost;
          otherServices.apiCalls += quantity;
        }
      });

      // 获取配额使用情况（模拟数据，实际需要调用具体的配额API）
      const quotaUsage = {
        speechQuota: {
          used: speechServices.charactersProcessed,
          limit: 500000, // 默认限制
          unit: 'characters'
        },
        translationQuota: {
          used: translationServices.charactersTranslated,
          limit: 2000000, // 默认限制
          unit: 'characters'
        }
      };

      return {
        subscriptionId,
        currentPeriod: {
          startDate: startOfMonth,
          endDate: currentDate,
          totalCost,
          totalUsage
        },
        serviceUsage: {
          speechServices,
          translationServices,
          otherServices
        },
        quotaUsage,
        lastUpdated: new Date().toISOString()
      };
    } catch (error: any) {
      logger.error('Error getting usage statistics:', error);
      throw error;
    }
  }

  async getRealTimeBillingStats(subscriptionId: string): Promise<{
    totalCost: number;
    currency: string;
    speechCost: number;
    translationCost: number;
    otherCost: number;
    usageCount: number;
    lastUpdated: string;
  }> {
    try {
      const billingPeriod = await this.getBillingUsage(subscriptionId);
      
      let speechCost = 0;
      let translationCost = 0;
      let otherCost = 0;

      for (const usage of billingPeriod.usageDetails) {
        if (usage.meterName.toLowerCase().includes('speech') || 
            usage.meterCategory.toLowerCase().includes('speech')) {
          speechCost += usage.cost;
        } else if (usage.meterName.toLowerCase().includes('translator') || 
                   usage.meterCategory.toLowerCase().includes('translator')) {
          translationCost += usage.cost;
        } else {
          otherCost += usage.cost;
        }
      }

      return {
        totalCost: billingPeriod.totalCost,
        currency: billingPeriod.currency,
        speechCost,
        translationCost,
        otherCost,
        usageCount: billingPeriod.usageDetails.length,
        lastUpdated: new Date().toISOString()
      };
    } catch (error: any) {
      logger.error('Error getting real-time billing stats:', error);
      throw error;
    }
  }

  /**
   * 映射使用详情
   */
  private mapUsageDetail(usage: any): BillingUsage {
    return {
      id: usage.id,
      name: usage.properties?.instanceName || usage.name,
      type: usage.type,
      unit: usage.properties?.unit || '',
      usageStart: usage.properties?.usageStart || '',
      usageEnd: usage.properties?.usageEnd || '',
      quantity: usage.properties?.usageQuantity || 0,
      meterId: usage.properties?.meterId || '',
      meterName: usage.properties?.meterDetails?.meterName || '',
      meterCategory: usage.properties?.meterDetails?.meterCategory || '',
      meterSubCategory: usage.properties?.meterDetails?.meterSubCategory || '',
      meterRegion: usage.properties?.meterDetails?.meterRegion || '',
      unitPrice: usage.properties?.unitPrice || 0,
      cost: usage.properties?.pretaxCost || 0,
      currency: usage.properties?.currency || 'USD'
    };
  }

  /**
   * 检查计费异常
   */
  async checkBillingAnomalies(subscriptionId: string, threshold: number = 100): Promise<{
    hasAnomalies: boolean;
    anomalies: Array<{
      resourceId: string;
      resourceName: string;
      cost: number;
      threshold: number;
      type: 'high_cost' | 'unusual_usage'
    }>;
  }> {
    try {
      const resources = await this.getCognitiveServicesBilling(subscriptionId);
      const anomalies: any[] = [];

      for (const resource of resources) {
        if (resource.totalCost > threshold) {
          anomalies.push({
            resourceId: resource.resourceId,
            resourceName: resource.resourceName,
            cost: resource.totalCost,
            threshold,
            type: 'high_cost'
          });
        }
      }

      return {
        hasAnomalies: anomalies.length > 0,
        anomalies
      };
    } catch (error: any) {
      logger.error('Error checking billing anomalies:', error);
      throw error;
    }
  }

  /**
   * 生成计费报告
   */
  async generateBillingReport(subscriptionId: string, format: 'json' | 'csv' = 'json'): Promise<any> {
    try {
      const stats = await this.getRealTimeBillingStats(subscriptionId);
      const resources = await this.getCognitiveServicesBilling(subscriptionId);
      const anomalies = await this.checkBillingAnomalies(subscriptionId);

      const report = {
        subscriptionId,
        generatedAt: new Date().toISOString(),
        summary: stats,
        resources,
        anomalies: anomalies.anomalies,
        recommendations: this.generateRecommendations(stats, anomalies)
      };

      if (format === 'csv') {
        return this.convertToCSV(report);
      }

      return report;
    } catch (error: any) {
      logger.error('Error generating billing report:', error);
      throw error;
    }
  }

  /**
   * 生成建议
   */
  private generateRecommendations(stats: any, anomalies: any): string[] {
    const recommendations: string[] = [];

    if (stats.speechCost > stats.translationCost * 2) {
      recommendations.push('语音服务成本较高，建议检查使用模式和优化策略');
    }

    if (stats.translationCost > stats.speechCost * 2) {
      recommendations.push('翻译服务成本较高，建议检查使用模式和优化策略');
    }

    if (anomalies.hasAnomalies) {
      recommendations.push(`发现 ${anomalies.anomalies.length} 个计费异常，建议立即检查`);
    }

    if (stats.totalCost > 1000) {
      recommendations.push('本月成本较高，建议设置预算警报');
    }

    return recommendations;
  }

  /**
   * 转换为CSV格式
   */
  private convertToCSV(report: any): string {
    const csvRows = [
      ['Resource ID', 'Resource Name', 'Location', 'Total Cost', 'Speech Cost', 'Translation Cost', 'Other Cost'],
      ...report.resources.map((resource: any) => [
        resource.resourceId,
        resource.resourceName,
        resource.location,
        resource.totalCost,
        resource.usageBreakdown.speech,
        resource.usageBreakdown.translation,
        resource.usageBreakdown.other
      ])
    ];

    return csvRows.map(row => row.join(',')).join('\n');
  }
}
