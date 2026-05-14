"""
Feature Engineering Pipeline
Extracts 15 behavioral features from sync_action.record table (JSONB format)
"""

import sys
import os
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from tqdm import tqdm
import json

# Add backend to path to access existing DB config
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))

from sqlalchemy import create_engine
from app.config import Settings

# Create settings and engine
settings = Settings()
db_url = settings.DATABASE_URL.replace('postgresql+asyncpg://', 'postgresql://')
engine = create_engine(db_url)


class ActionFeatureEngineer:
    """
    Extract 15 behavioral features from Actions Data (JSONB format)
    """
    
    def __init__(self, lookback_days=90):
        self.lookback_days = lookback_days
        
    def extract_features(self, subject_key, domain, actions_df):
        """
        Extract all 15 features for a user in a domain
        
        Args:
            subject_key: User identifier (subject_key)
            domain: Domain (ecommerce, food, mobility, finance)
            actions_df: Full actions dataframe
        
        Returns:
            Dictionary of 15 features
        """
        # Filter to user + domain
        user_data = actions_df[
            (actions_df['subject_key'] == subject_key) & 
            (actions_df['domain'] == domain)
        ].copy()
        
        if len(user_data) == 0:
            return None
        
        # Sort by date
        user_data = user_data.sort_values('transaction_date')
        
        # Calculate features
        features = {}
        
        # === FREQUENCY FEATURES (5) ===
        features.update(self._frequency_features(user_data))
        
        # === MONETARY FEATURES (5) ===
        features.update(self._monetary_features(user_data))
        
        # === TEMPORAL FEATURES (5) ===
        features.update(self._temporal_features(user_data))
        
        # Add metadata
        features['subject_key'] = subject_key
        features['domain'] = domain
        features['total_transactions'] = len(user_data)
        
        return features
    
    def _frequency_features(self, df):
        """5 frequency-based features"""
        days_span = (df['transaction_date'].max() - df['transaction_date'].min()).days
        if days_span == 0:
            days_span = 1
        
        return {
            'orders_per_week': len(df) / (days_span / 7),
            'growth_rate': self._calculate_growth_rate(df),
            'recency_weighted_frequency': self._recency_weighted_freq(df),
            'volatility': df.groupby(df['transaction_date'].dt.to_period('W')).size().std() if len(df) > 1 else 0,
            'trend_slope': self._calculate_trend(df)
        }
    
    def _monetary_features(self, df):
        """5 monetary features"""
        amounts = df['transaction_amount']
        
        # Handle discount - check if column exists and has values
        discount_rate = 0
        if 'discount_applied' in df.columns:
            discount_rate = (df['discount_applied'].fillna(0) > 0).mean()
        
        return {
            'avg_order_value': amounts.mean(),
            'spending_trend': self._calculate_spending_trend(df),
            'price_sensitivity': amounts.std() / (amounts.mean() + 1) if amounts.mean() > 0 else 0,
            'basket_size': amounts.quantile(0.75) / (amounts.quantile(0.25) + 1) if amounts.quantile(0.25) > 0 else 0,
            'discount_usage_rate': discount_rate
        }
    
    def _temporal_features(self, df):
        """5 temporal features"""
        df = df.copy()
        df['hour'] = pd.to_datetime(df['transaction_date']).dt.hour
        df['day_of_week'] = pd.to_datetime(df['transaction_date']).dt.dayofweek
        
        # Calculate inter-order time
        df_sorted = df.sort_values('transaction_date')
        inter_order_times = df_sorted['transaction_date'].diff().dt.total_seconds() / 3600  # hours
        median_time = inter_order_times.median() if len(inter_order_times) > 1 else 0
        
        return {
            'night_order_ratio': ((df['hour'] >= 22) | (df['hour'] <= 6)).mean(),
            'weekend_ratio': (df['day_of_week'] >= 5).mean(),
            'peak_hour_preference': int(df['hour'].mode()[0]) if len(df) > 0 else 12,
            'seasonality_index': self._calculate_seasonality(df),
            'inter_order_time': median_time
        }
    
    def _calculate_growth_rate(self, df):
        """Calculate transaction growth rate"""
        if len(df) < 4:
            return 0
            
        df = df.sort_values('transaction_date')
        
        # Split into first half and second half
        mid = len(df) // 2
        first_half = df.iloc[:mid]
        second_half = df.iloc[mid:]
        
        first_days = (first_half['transaction_date'].max() - first_half['transaction_date'].min()).days
        second_days = (second_half['transaction_date'].max() - second_half['transaction_date'].min()).days
        
        if first_days == 0 or second_days == 0:
            return 0
        
        first_rate = len(first_half) / first_days
        second_rate = len(second_half) / second_days
        
        if first_rate == 0:
            return 0
        
        return (second_rate - first_rate) / first_rate
    
    def _recency_weighted_freq(self, df):
        """Weight recent transactions more heavily"""
        df = df.copy()
        df = df.sort_values('transaction_date')
        
        # Days since each transaction
        latest_date = df['transaction_date'].max()
        df['days_ago'] = (latest_date - df['transaction_date']).dt.days
        
        # Exponential decay weight
        df['weight'] = np.exp(-df['days_ago'] / 30)  # 30-day decay
        
        return df['weight'].sum() / len(df) if len(df) > 0 else 0
    
    def _calculate_trend(self, df):
        """Calculate trend slope using linear regression"""
        if len(df) < 2:
            return 0
            
        df = df.copy()
        df = df.sort_values('transaction_date')
        
        # Weekly transaction counts
        weekly = df.groupby(df['transaction_date'].dt.to_period('W')).size()
        
        if len(weekly) < 2:
            return 0
        
        x = np.arange(len(weekly))
        y = weekly.values
        
        # Simple linear regression
        slope = np.polyfit(x, y, 1)[0]
        return slope
    
    def _calculate_spending_trend(self, df):
        """Calculate spending trend over time"""
        if len(df) < 2:
            return 0
            
        df = df.copy()
        df = df.sort_values('transaction_date')
        
        # Monthly average spending
        monthly = df.groupby(df['transaction_date'].dt.to_period('M'))['transaction_amount'].mean()
        
        if len(monthly) < 2:
            return 0
        
        x = np.arange(len(monthly))
        y = monthly.values
        
        slope = np.polyfit(x, y, 1)[0]
        return slope
    
    def _calculate_seasonality(self, df):
        """Calculate seasonality index"""
        df = df.copy()
        
        # Monthly transaction counts
        monthly = df.groupby(df['transaction_date'].dt.month).size()
        
        if len(monthly) < 2:
            return 0
        
        # Coefficient of variation
        return monthly.std() / monthly.mean() if monthly.mean() > 0 else 0


def extract_actions_data(domain=None, limit=None):
    """
    Extract data from sync_action.record table (JSONB format)
    Map domains based on source_name (platform)
    """
    
    query = """
    SELECT 
        subject_key,
        CASE 
            -- Ecommerce platforms
            WHEN LOWER(data->'payload'->>'source_name') IN ('ajio', 'amazon', 'bigbasket', 'flipkart', 'nykaa', 'myntra') 
                THEN 'ecom'
            -- Finance platforms
            WHEN LOWER(data->'payload'->>'source_name') IN ('phonepe', 'paytm', 'hdfc', 'icici') 
                THEN 'finance'
            -- Food platforms
            WHEN LOWER(data->'payload'->>'source_name') IN ('swiggy', 'zomato') 
                THEN 'food'
            -- Mobility platforms
            WHEN LOWER(data->'payload'->>'source_name') IN ('uber', 'ola') 
                THEN 'mobility'
            ELSE 'unknown'
        END as domain,
        data->'payload'->>'source_name' as platform,
        -- Handle both datetime strings and Unix timestamps
        CASE
            WHEN data->'payload'->>'order_time' IS NOT NULL 
                THEN CAST(data->'payload'->>'order_time' as timestamp)
            WHEN data->'payload'->>'pickupTime' ~ '^[0-9]+$' 
                THEN to_timestamp(CAST(data->'payload'->>'pickupTime' as bigint))
            WHEN data->'payload'->>'pickupTime' IS NOT NULL 
                THEN CAST(data->'payload'->>'pickupTime' as timestamp)
            WHEN data->'payload'->>'receivedDate' ~ '^[0-9]+$' 
                THEN to_timestamp(CAST(data->'payload'->>'receivedDate' as bigint))
            WHEN data->'payload'->>'receivedDate' IS NOT NULL 
                THEN CAST(data->'payload'->>'receivedDate' as timestamp)
            WHEN data->'payload'->>'transaction_date' ~ '^[0-9]+$' 
                THEN to_timestamp(CAST(data->'payload'->>'transaction_date' as bigint))
            WHEN data->'payload'->>'transaction_date' IS NOT NULL 
                THEN CAST(data->'payload'->>'transaction_date' as timestamp)
            ELSE NULL
        END as transaction_date,
        CAST(data->'payload'->>'totalCharged' as float) as transaction_amount,
        data->'payload'->>'source_category' as category,
        data->'payload'->>'item_name' as subcategory,
        data->'payload'->>'paymentMethod' as payment_method,
        CAST(COALESCE(data->'payload'->>'deliveryFee', '0') as float) as discount_applied,
        created_at,
        workspace_id
    FROM sync_action.record
    WHERE data->'payload'->>'source_name' IS NOT NULL
    """
    
    if domain:
        domain_filter_map = {
            'ecom': "LOWER(data->'payload'->>'source_name') IN ('ajio', 'amazon', 'bigbasket', 'flipkart', 'nykaa', 'myntra')",
            'finance': "LOWER(data->'payload'->>'source_name') IN ('phonepe', 'paytm', 'hdfc', 'icici')",
            'food': "LOWER(data->'payload'->>'source_name') IN ('swiggy', 'zomato')",
            'mobility': "LOWER(data->'payload'->>'source_name') IN ('uber', 'ola')"
        }
        if domain in domain_filter_map:
            query += f" AND {domain_filter_map[domain]}"
    
    query += " ORDER BY subject_key, transaction_date NULLS LAST"
    
    if limit:
        query += f" LIMIT {limit}"
    
    print(f"\n{'='*60}")
    print(f"Extracting Actions Data from sync_action.record")
    print(f"{'='*60}")
    
    df = pd.read_sql(query, engine)
    
    # Convert transaction_date to datetime (already done in SQL, but ensure proper type)
    df['transaction_date'] = pd.to_datetime(df['transaction_date'], errors='coerce')
    
    # Drop rows with null dates or amounts
    df = df.dropna(subset=['transaction_date', 'transaction_amount'])
    
    # Remove 'unknown' domain
    df = df[df['domain'] != 'unknown']
    
    print(f"✅ Extracted {len(df):,} transactions")
    print(f"   Users: {df['subject_key'].nunique():,}")
    print(f"   Domains: {df['domain'].unique().tolist()}")
    print(f"   Platforms: {df['platform'].unique().tolist()}")
    
    if len(df) > 0:
        print(f"   Date range: {df['transaction_date'].min()} to {df['transaction_date'].max()}")
        print(f"\nTransactions by domain:")
        domain_counts = df.groupby('domain').size()
        for domain, count in domain_counts.items():
            print(f"   {domain}: {count:,} transactions")
    
    return df
    
    if domain:
        query += f" AND data->>'domain' = '{domain}'"
    
    query += " ORDER BY subject_key, transaction_date"
    
    if limit:
        query += f" LIMIT {limit}"
    
    print(f"\n{'='*60}")
    print(f"Extracting Actions Data from sync_action.record")
    print(f"{'='*60}")
    
    df = pd.read_sql(query, engine)
    
    # Convert transaction_date to datetime
    df['transaction_date'] = pd.to_datetime(df['transaction_date'], errors='coerce')
    
    # Drop rows with null dates or amounts
    df = df.dropna(subset=['transaction_date', 'transaction_amount'])
    
    print(f"✅ Extracted {len(df):,} transactions")
    print(f"   Users: {df['subject_key'].nunique():,}")
    print(f"   Domains: {df['domain'].unique().tolist()}")
    
    if len(df) > 0:
        print(f"   Date range: {df['transaction_date'].min()} to {df['transaction_date'].max()}")
    
    return df


def get_user_transaction_count(min_transactions=5):
    """
    Get users with minimum transaction count per domain
    """
    query = f"""
    WITH domain_mapped AS (
        SELECT 
            subject_key,
            CASE 
                WHEN LOWER(data->'payload'->>'source_name') IN ('ajio', 'amazon', 'bigbasket', 'flipkart', 'nykaa', 'myntra') 
                    THEN 'ecom'
                WHEN LOWER(data->'payload'->>'source_name') IN ('phonepe', 'paytm', 'hdfc', 'icici') 
                    THEN 'finance'
                WHEN LOWER(data->'payload'->>'source_name') IN ('swiggy', 'zomato') 
                    THEN 'food'
                WHEN LOWER(data->'payload'->>'source_name') IN ('uber', 'ola') 
                    THEN 'mobility'
                ELSE 'unknown'
            END as domain
        FROM sync_action.record
        WHERE data->'payload'->>'source_name' IS NOT NULL
          AND CAST(data->'payload'->>'order_time' as timestamp) IS NOT NULL
          AND CAST(data->'payload'->>'totalCharged' as float) IS NOT NULL
    )
    SELECT 
        subject_key,
        domain,
        COUNT(*) as tx_count
    FROM domain_mapped
    WHERE domain != 'unknown'
    GROUP BY subject_key, domain
    HAVING COUNT(*) >= {min_transactions}
    ORDER BY tx_count DESC
    """
    
    df = pd.read_sql(query, engine)
    print(f"\n✅ Found {len(df):,} user-domain pairs with ≥{min_transactions} transactions")
    
    # Show distribution
    if len(df) > 0:
        print("\nDistribution by domain:")
        domain_counts = df.groupby('domain').size()
        for domain, count in domain_counts.items():
            print(f"   {domain}: {count:,} users")
    
    return df
    


def build_feature_dataset(actions_df, min_transactions=5, output_file='data/features.csv'):
    """
    Build complete feature dataset for all eligible users
    
    Args:
        actions_df: Actions dataframe
        min_transactions: Minimum transactions required per domain
        output_file: Where to save features
    
    Returns:
        Feature dataframe
    """
    engineer = ActionFeatureEngineer()
    
    # Get eligible users (≥5 transactions per domain)
    user_domain_counts = actions_df.groupby(['subject_key', 'domain']).size().reset_index(name='count')
    eligible = user_domain_counts[user_domain_counts['count'] >= min_transactions]
    
    print(f"\n{'='*60}")
    print(f"Building Features for {len(eligible):,} user-domain combinations")
    print(f"{'='*60}")
    print(f"Minimum transactions required: {min_transactions}")
    
    all_features = []
    
    for idx, row in tqdm(eligible.iterrows(), total=len(eligible), desc="Extracting features"):
        subject_key = row['subject_key']
        domain = row['domain']
        
        features = engineer.extract_features(subject_key, domain, actions_df)
        if features:
            all_features.append(features)
    
    # Convert to dataframe
    features_df = pd.DataFrame(all_features)
    
    if len(features_df) == 0:
        print("\n⚠️  No features extracted! Check your data.")
        return features_df
    
    # Save to data folder
    output_path = os.path.join(os.path.dirname(__file__), '..', output_file)
    features_df.to_csv(output_path, index=False)
    
    print(f"\n{'='*60}")
    print(f"✅ Features saved to {output_file}")
    print(f"{'='*60}")
    print(f"   Shape: {features_df.shape}")
    print(f"   Total users: {features_df['subject_key'].nunique():,}")
    print(f"   Domains: {features_df['domain'].unique().tolist()}")
    print(f"\nFeature columns:")
    feature_cols = [col for col in features_df.columns if col not in ['subject_key', 'domain', 'total_transactions']]
    for col in feature_cols:
        print(f"   - {col}")
    
    print(f"\nSample statistics:")
    print(features_df[['orders_per_week', 'avg_order_value', 'total_transactions']].describe())
    
    return features_df


if __name__ == "__main__":
    print("\n" + "="*70)
    print("SYNTERA ML PIPELINE - FEATURE ENGINEERING")
    print("="*70)
    
    # Step 1: Extract actions data
    actions_df = extract_actions_data()
    
    if len(actions_df) == 0:
        print("\n❌ No data extracted! Check your database.")
        exit(1)
    
    # Step 2: Check eligible users
    eligible_users = get_user_transaction_count(min_transactions=5)
    
    if len(eligible_users) == 0:
        print("\n❌ No users with ≥5 transactions found!")
        exit(1)
    
    # Step 3: Build features
    features_df = build_feature_dataset(actions_df, min_transactions=5)
    
    if len(features_df) == 0:
        print("\n❌ Feature extraction failed!")
        exit(1)
    
    print("\n" + "="*70)
    print("✅ Feature engineering complete!")
    print("="*70)
    print("\nNext step: Train models with 'python train_all.py'")