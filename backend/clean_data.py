import pandas as pd
import numpy as np

df = pd.read_csv('app/ml/data/features.csv')

print('='*70)
print('COMPREHENSIVE DATA CLEANING')
print('='*70)
print(f'\nBefore: {len(df)} samples')
print(f'Max orders_per_week: {df["orders_per_week"].max():.2f}')

# Remove extreme outliers (keep 0-100 orders/week across ALL domains)
df_clean = df[df['orders_per_week'] <= 100]

print(f'\nAfter: {len(df_clean)} samples')
print(f'Removed: {len(df) - len(df_clean)} outliers ({(len(df)-len(df_clean))/len(df)*100:.1f}%)')
print(f'New max: {df_clean["orders_per_week"].max():.2f}')

# Fill missing volatility with median
df_clean['volatility'] = df_clean['volatility'].fillna(df_clean['volatility'].median())

print(f'\nMissing values after cleaning:')
print(df_clean.isnull().sum().sum())

# Save
df_clean.to_csv('app/ml/data/features.csv', index=False)

print('\n✅ Data cleaned and saved')
print(f'\nFinal distribution by domain:')
for domain in sorted(df_clean['domain'].unique()):
    count = len(df_clean[df_clean['domain']==domain])
    print(f'  {domain}: {count}')