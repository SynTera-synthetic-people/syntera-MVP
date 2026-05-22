"""
More aggressive finance cleaning
"""
import pandas as pd
import numpy as np

# Load features
df = pd.read_csv('data/features.csv')
finance = df[df['domain'] == 'finance'].copy()

print(f"Finance users before cleaning: {len(finance):,}")

# Show current extremes
print(f"\nCurrent extremes:")
print(f"Max orders/week: {finance['orders_per_week'].max():.2f}")
print(f"99th percentile: {finance['orders_per_week'].quantile(0.99):.2f}")
print(f"95th percentile: {finance['orders_per_week'].quantile(0.95):.2f}")

# More aggressive cleaning
# Remove top 1% (these are likely data errors)
threshold_99 = finance['orders_per_week'].quantile(0.99)
finance_clean = finance[finance['orders_per_week'] <= threshold_99].copy()

print(f"\nFinance users after cleaning: {len(finance_clean):,}")
print(f"Removed: {len(finance) - len(finance_clean):,} extreme outliers")
print(f"New max: {finance_clean['orders_per_week'].max():.2f}")

# Replace in full dataset
df_clean = df[df['domain'] != 'finance'].copy()
df_clean = pd.concat([df_clean, finance_clean], ignore_index=True)

# Save the CLEANED version (not the original df!)
df_clean.to_csv('data/features_clean_v2.csv', index=False)  # ← FIXED
df_clean.to_csv('data/features.csv', index=False)            # ← FIXED

print(f"\n✅ Saved to features_clean_v2.csv")
print(f"✅ Saved to features.csv (overwriting old version)")
print(f"Total users: {len(df_clean):,}")