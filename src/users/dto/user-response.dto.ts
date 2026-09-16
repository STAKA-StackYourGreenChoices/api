import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, Status } from '../../../generated/prisma';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'Alex Morgan' })
  name!: string;

  @ApiPropertyOptional({ example: '+15551234567', nullable: true })
  phone!: string | null;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty({ enum: Status })
  status!: Status;

  @ApiPropertyOptional({ nullable: true })
  profileBio!: string | null;

  @ApiPropertyOptional({ nullable: true })
  profileAvatarUrl!: string | null;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
