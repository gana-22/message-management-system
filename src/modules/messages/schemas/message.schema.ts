import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MessageDocument = Message & Document;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: String })
  id: string;

  @Prop({ required: true })
  conversationId: string;

  @Prop({ required: true })
  senderId: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: Date.now })
  timestamp: Date;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Add indexes for efficient querying
MessageSchema.index({ conversationId: 1 });
MessageSchema.index({ timestamp: -1 });
MessageSchema.index({ content: 'text' });
